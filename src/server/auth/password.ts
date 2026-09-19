import bcrypt from 'bcryptjs';
import { BCRYPT_SALT_ROUNDS } from '@/lib/constants';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
