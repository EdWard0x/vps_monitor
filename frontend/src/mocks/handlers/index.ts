import { publicHandlers } from './public';
import { authHandlers } from './auth';
import { accountHandlers } from './account';
import { adminHandlers } from './admin';

export const handlers = [
  ...publicHandlers,
  ...authHandlers,
  ...accountHandlers,
  ...adminHandlers,
];
