import { z } from 'zod';
export const PairingSchema = z.object({
 token_hash: z.string().regex(/^[a-f0-9]{64}$/),
 public_key: z.object({ kty: z.literal('RSA'), n: z.string().regex(/^[A-Za-z0-9_-]{342}$/), e: z.literal('AQAB'), alg: z.literal('RSA-OAEP-256'), ext: z.literal(true), key_ops: z.array(z.literal('encrypt')).length(1) }).strict(),
}).strict();
export function backupCursor(value: unknown): string {
 if(typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(value) || BigInt(value)>9223372036854775807n) throw new Error('Urutan backup tidak valid');
 return value;
}
export function safeBackupPayload(p: Record<string,unknown>) {
 const result={...p};
 for(const key of ['pin_hash','pin_salt','cashier_code','cashier_auth_password','cashier_auth_user_id','static_qris_payload','token','access_token','refresh_token','password']) delete result[key];
 return result;
}
