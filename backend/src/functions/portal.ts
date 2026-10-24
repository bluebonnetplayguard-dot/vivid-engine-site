import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/guard';
import { config } from '../config';
import { EntitiesService, isId } from '../entities/entities.service';
import { ApiError, badRequest, forbidden, notFound } from '../errors';
import { Mail } from '../mail';
import { Notifier } from '../notify';
import { RateLimiter } from '../rate-limit';

const SAFE_LEASE_FIELDS = [
  'id', 'domainName', 'domainStatus', 'registrationDate', 'renewalDate', 'leaseStartDate', 'minimumTermEndDate',
  'monthlyLeaseCents', 'billingStatus', 'billingInterval', 'nextBillingDate', 'autoRenewStatus', 'transferEligibilityStatus',
  'dnsManagementStatus', 'websiteConnectionStatus', 'sslStatus', 'serviceStatus', 'supportContactEmail', 'clientVisibleNotes', 'updated_date',
];
const OPEN_FOR_STATUS = ['Submitted', 'Under Review', 'Additional Information Needed'];
const OPEN_FOR_NEW_REQUEST = [...OPEN_FOR_STATUS, 'Approved For Term End'];
const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

// Client-portal functions, ported from the matching base44/functions/*. Each one
// scopes reads to the signed-in user, so clients never need direct access to
// the admin-only collections.
@Injectable()
export class PortalService {
  private readonly log = new Logger('Portal');

  constructor(
    private readonly entities: EntitiesService,
    private readonly notifier: Notifier,
    private readonly mail: Mail,
    private readonly limiter: RateLimiter,
  ) {}

  private audit(user: AuthUser, eventType: string, entityType: string, entityId: string, extra: Record<string, unknown> = {}) {
    return this.entities.insert('EngineeringAuditEvent', {
      actorUserId: user.id, actorEmail: user.email, eventType, entityType, entityId, eventTimestamp: new Date().toISOString(), ...extra,
    }, user.id).catch(e => this.log.warn(`audit failed: ${(e as Error).message}`));
  }

  private async myLease(user: AuthUser) {
    const [lease] = await this.entities.filterTrusted('ManagedDomainLease', { clientUserId: user.id }, '-created_date', 1);
    return lease ?? null;
  }

  async sendProjectMessage(user: AuthUser, body: any) {
    if (Object.keys(body).some(key => !['project_id', 'content'].includes(key))) throw badRequest('Only project and message text may be submitted.');
    const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!isId(projectId) || !content || content.length > 5000) throw badRequest('A valid project and a message of 1–5,000 characters are required.');
    // Project assignments are administrator-controlled. Names are never proof of ownership.
    const project = await this.entities.findTrusted('Project', projectId);
    const owns = project && (user.role === 'admin' || project.clientUserId === user.id || project.created_by_id === user.id);
    if (!owns) throw forbidden('Project unavailable or not assigned to your account.');
    await this.limiter.hit(`project-message:${user.id}`, 10, 60, 'Please wait before sending more messages.');
    const message = await this.entities.insert('Message', {
      project_id: projectId, content, sender_name: 'Client', sender_user_id: user.id, is_from_client: true,
    }, user.id);
    void this.notifier.emailAdmins(`Client message: ${project.title}`, `${user.email} wrote about "${project.title}":\n\n${content}\n\n${config.PUBLIC_ORIGIN}/portal/projects/${projectId}`);
    return { message: { id: message.id, project_id: projectId, content, sender_name: 'Client', is_from_client: true, created_date: message.created_date } };
  }

  async getMyDomainLeaseStatus(user: AuthUser) {
    const lease = await this.myLease(user);
    let cancellationRequestStatus = 'None';
    if (lease) {
      const [open] = await this.entities.filterTrusted('DomainLeaseCancellationRequest', { managedDomainLeaseId: lease.id, clientUserId: user.id, status: { $in: OPEN_FOR_STATUS } });
      if (open) cancellationRequestStatus = open.status;
    }
    void this.audit(user, 'Client Domain Status Viewed', 'ManagedDomainLease', lease?.id || 'none');
    if (!lease) return { lease: null, cancellationRequestStatus };
    return { lease: Object.fromEntries(SAFE_LEASE_FIELDS.map(k => [k, lease[k]])), cancellationRequestStatus };
  }

  async getClientBillingSummary(user: AuthUser) {
    const lease = await this.myLease(user);
    if (!lease) return { billing: null };
    const [open] = await this.entities.filterTrusted('DomainLeaseCancellationRequest', { managedDomainLeaseId: lease.id, clientUserId: user.id, status: { $in: OPEN_FOR_STATUS } });
    return {
      billing: {
        serviceName: 'Managed Domain Service', billingStatus: lease.billingStatus, nextBillingDate: lease.nextBillingDate,
        monthlyLeaseCents: lease.monthlyLeaseCents, cancellationRequestStatus: open ? open.status : 'None',
      },
    };
  }

  async requestDomainLeaseCancellation(user: AuthUser, body: any) {
    const requestId = randomUUID();
    const managedDomainLeaseId = clean(body.managedDomainLeaseId, 150);
    const requestReason = clean(body.requestReason, 200);
    const requestDetails = clean(body.requestDetails, 1500);
    if (!managedDomainLeaseId || !requestReason) throw badRequest('Please select a reason and try again.', { requestId });
    if (body.clientAcknowledgment !== true || body.agreementAcknowledgment !== true) throw badRequest('Please review and accept the required acknowledgments.', { requestId });

    const leases = await this.entities.filterTrusted('ManagedDomainLease', { clientUserId: user.id }, '-created_date', 50);
    const lease = leases.find(l => l.id === managedDomainLeaseId);
    if (!lease) throw new ApiError(403, 'You do not have permission to make this request.', { requestId });
    if (lease.serviceStatus !== 'Active') throw new ApiError(409, 'This managed-domain service is not eligible for a cancellation request.', { requestId });
    const existing = await this.entities.filterTrusted('DomainLeaseCancellationRequest', { managedDomainLeaseId: lease.id, clientUserId: user.id }, '-created_date', 50);
    if (existing.some(r => OPEN_FOR_NEW_REQUEST.includes(r.status))) throw new ApiError(409, 'A cancellation request is already being reviewed.', { requestId });

    const now = new Date().toISOString();
    const request = await this.entities.insert('DomainLeaseCancellationRequest', {
      companyId: lease.companyId, managedDomainLeaseId: lease.id, clientUserId: user.id, clientEmail: user.email || '',
      domainName: lease.domainName, requestDate: now, requestReason, requestDetails,
      clientAcknowledgment: true, agreementAcknowledgment: true, agreementVersion: lease.agreementVersion || 'current', status: 'Submitted',
    }, user.id);
    void this.audit(user, 'Domain Lease Cancellation Requested', 'ManagedDomainLease', lease.id, {
      companyId: lease.companyId, metadata: { requestId, cancellationRequestId: request.id, domainName: lease.domainName, requestReason, minimumTermEndDate: lease.minimumTermEndDate || null },
    });
    void this.notifier.emailAdmins('New managed-domain cancellation request',
      `New managed-domain cancellation request\n\nDomain: ${lease.domainName}\nClient: ${lease.clientBusinessName || user.email}\nReason: ${requestReason}\nRequest ID: ${requestId}\n\nReview in the admin dashboard.`);
    return {
      success: true, requestId, cancellationRequestId: request.id,
      message: 'Your cancellation request has been submitted for review. Your service remains active until you receive written confirmation.',
    };
  }

  async withdrawDomainLeaseCancellationRequest(user: AuthUser, body: any) {
    const requestId = body?.requestId;
    if (!requestId) throw badRequest('Request id required');
    const request = await this.entities.findTrusted('DomainLeaseCancellationRequest', String(requestId));
    if (!request || request.clientUserId !== user.id) throw notFound('Request not found');
    if (request.status !== 'Submitted') throw new ApiError(409, 'Only submitted requests can be withdrawn');
    await this.entities.patch('DomainLeaseCancellationRequest', request.id, { status: 'Withdrawn' });
    void this.audit(user, 'Client Withdrew Cancellation Request', 'DomainLeaseCancellationRequest', request.id);
    return { success: true };
  }

  async createDomainSupportRequest(user: AuthUser, body: any) {
    const subject = typeof body?.subject === 'string' ? body.subject.trim().slice(0, 160) : '';
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 4000) : '';
    const leaseId = typeof body?.managedDomainLeaseId === 'string' ? body.managedDomainLeaseId.slice(0, 128) : '';
    if (!subject || !message) throw badRequest('Subject and message are required');
    await this.limiter.hit(`domain-support:${user.id}`, 3, 3600, 'Too many requests. Please try again in an hour.');
    void this.audit(user, 'Client Domain Support Request', 'ManagedDomainLease', leaseId || 'none', { details: subject });
    await this.notifier.emailAdmins(`Domain support request from ${user.email}`,
      `A client submitted a domain support request.\n\nSubject: ${subject}\n\n${message}\n\nFrom: ${user.email}`);
    return { success: true };
  }

  // Persist first: an email failure must never lose a request or claim deletion happened.
  async requestAccountDeletion(user: AuthUser, body: any) {
    if (body?.confirm !== true) throw badRequest('Please confirm your deletion request.');
    if (!user.email) throw badRequest('Your account needs a verified email address.');
    await this.limiter.hit(`account-deletion:${user.id}`, 3, 3600, 'Too many requests. Please try again in an hour.');
    let [record] = await this.entities.filterTrusted('AccountDeletionRequest', { user_id: user.id, status: { $in: ['pending', 'processing'] } }, '-created_date', 1);
    if (!record) {
      record = await this.entities.insert('AccountDeletionRequest', {
        user_id: user.id, email: user.email, status: 'pending', requested_at: new Date().toISOString(),
        due_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), owner_notified: false, user_notified: false,
      }, user.id);
    }
    const dueDate = new Date(record.due_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', dateStyle: 'long' });
    const deliveries = [
      {
        key: 'owner_notified', to: config.STAFF_NOTIFY_EMAIL, subject: 'Account deletion requested',
        text: `A signed-in user has submitted a verified deletion request.\n\nAccount: ${user.email}\nUser ID: ${user.id}\nRequest reference: ${record.id}\nProcess by: ${dueDate}\n\nDelete or anonymize the account and associated personal data within 30 days. Review legally required invoices, payment records and signed agreements separately, and confirm completion to the user. The request is saved for your team to process; it has not deleted the account automatically.`,
      },
      {
        key: 'user_notified', to: user.email, subject: 'Your account deletion request is received',
        text: `Your Vivid Engine Solutions account deletion request has been saved.\n\nReference: ${record.id}\nProcess by: ${dueDate}\n\nOur team processes requests within 30 days, subject to legal retention requirements. This confirms your request, not completed deletion. Invoices, payment records and signed agreements may need to be retained under applicable law.\n\n${config.PUBLIC_ORIGIN}/delete-account`,
      },
    ];
    let pending = false;
    for (const d of deliveries) {
      if (record[d.key]) continue;
      if (await this.mail.send(d.to, d.subject, d.text)) await this.entities.patch('AccountDeletionRequest', record.id, { [d.key]: true });
      else pending = true;
    }
    return { success: true, request_id: record.id, due_at: record.due_at, notification_pending: pending };
  }
}
