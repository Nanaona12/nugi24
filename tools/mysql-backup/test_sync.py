import unittest
from sync import persist_page
class Cursor:
 def __init__(self,db): self.db=db
 def execute(self,sql,args):
  assert sql.startswith('INSERT INTO backup_history')
  if self.db.fail: raise RuntimeError('disconnect')
  self.db.pending.setdefault((args[0],args[1]),args)
 def close(self): pass
class Db:
 def __init__(self): self.rows={};self.pending={};self.fail=False
 def cursor(self): return Cursor(self)
 def commit(self): self.rows.update(self.pending);self.pending={}
 def rollback(self): self.pending={}
class Retention(unittest.TestCase):
 def test_insert_update_delete_and_retry_keep_every_version(self):
  db=Db()
  events=[dict(tenant_id='shop',seq=str(i),table_name='transaction_items',record_id='item',operation=op,payload={'qty':5,'subtotal':85000},previous_payload={'qty':5} if op=='update' else None,recorded_at='2026-10-11') for i,op in enumerate(['insert','update','delete'],1)]
  page={'tenant_id':'shop','events':events}
  persist_page(db,page);persist_page(db,page)
  self.assertEqual(len(db.rows),3)
  self.assertEqual([v[4] for v in db.rows.values()],['insert','update','delete'])
 def test_disconnect_rolls_back_and_retry_succeeds(self):
  db=Db();db.fail=True
  page={'tenant_id':'shop','events':[dict(tenant_id='shop',seq='1',table_name='products',record_id='p',operation='delete',payload={'name':'saved'},recorded_at='now')]}
  with self.assertRaises(RuntimeError):persist_page(db,page)
  self.assertEqual(db.rows,{})
  db.fail=False;persist_page(db,page);self.assertEqual(len(db.rows),1)
 def test_other_tenant_is_denied(self):
  db=Db()
  with self.assertRaises(RuntimeError):persist_page(db,{'tenant_id':'shop','events':[{'tenant_id':'other'}]})
  self.assertEqual(db.rows,{})
if __name__=='__main__':unittest.main()
