import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface ChangeEvent {
  entity: string;
  type: 'create' | 'update' | 'delete';
  id: string;
  data: Record<string, unknown> | null;
  createdBy?: string | null;
}

// In-process change feed. The API runs as one container, so this is enough;
// if it is ever scaled out, swap the Subject for Postgres LISTEN/NOTIFY.
@Injectable()
export class Realtime {
  readonly changes = new Subject<ChangeEvent>();

  emit(event: ChangeEvent) {
    this.changes.next(event);
  }
}
