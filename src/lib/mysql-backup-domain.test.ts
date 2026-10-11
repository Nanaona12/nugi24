import { describe,it,expect } from 'vitest';
import { backupCursor, safeBackupPayload, PairingSchema } from './mysql-backup-domain';
describe('MySQL backup rules',()=>{
 it('keeps exact sequence beyond JavaScript safe integers',()=>expect(backupCursor('9007199254740993')).toBe('9007199254740993'));
 it('rejects invalid and overflowing cursors',()=>{for(const c of ['-1','1.5','01','9223372036854775808',1])expect(()=>backupCursor(c)).toThrow()});
 it('preserves receipt details while excluding application secrets',()=>{
  expect(safeBackupPayload({product_name:'Djarum Coklat',qty:5,receipt_detail:'5 bungkus',subtotal:85000,pin_hash:'private',pin_salt:'private',password:'private',cashier_auth_password:'private'})).toEqual({product_name:'Djarum Coklat',qty:5,receipt_detail:'5 bungkus',subtotal:85000});
 });
 it('rejects private keys and invalid pairing',()=>expect(()=>PairingSchema.parse({token_hash:'a'.repeat(64),public_key:{kty:'RSA',d:'private'}})).toThrow());
});
