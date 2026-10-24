import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/guard';
import { badRequest } from '../errors';
import { HistoryService } from './history.service';

// /api/history/*: saved conversations, Spaces and settings. Signed-in accounts only; what each person may do
// is decided by their plan (see ./rules). Guests and Free accounts get "plan required" for everything except delete.
@Controller('history')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) { return this.history.publicState(user); }

  @Patch('settings')
  settings(@CurrentUser() user: AuthUser, @Body() body: any) { return this.history.updateSettings(user, body); }

  @Get('conversations')
  list(@CurrentUser() user: AuthUser, @Query() query: any) { return this.history.list(user, query); }

  @Get('conversations/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.history.get(user, id); }

  @Patch('conversations/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) { return this.history.update(user, id, body); }

  @Delete('conversations/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.history.remove(user, id); }

  // Deletes everything this person saved. Must be asked for explicitly: DELETE /history/conversations?confirm=all
  @Delete('conversations')
  removeAll(@CurrentUser() user: AuthUser, @Query('confirm') confirm?: string) {
    if (confirm !== 'all') throw badRequest('Add ?confirm=all to delete every saved conversation.');
    return this.history.removeAll(user);
  }

  @Get('export')
  exportAll(@CurrentUser() user: AuthUser) { return this.history.exportAll(user); }

  @Get('spaces')
  spaces(@CurrentUser() user: AuthUser) { return this.history.spaces(user); }

  @Post('spaces') @HttpCode(200)
  createSpace(@CurrentUser() user: AuthUser, @Body() body: any) { return this.history.createSpace(user, body?.name); }

  @Patch('spaces/:id')
  renameSpace(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) { return this.history.renameSpace(user, id, body?.name); }

  @Delete('spaces/:id')
  deleteSpace(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.history.deleteSpace(user, id); }
}
