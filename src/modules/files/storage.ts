import "server-only";
import type { PoolClient } from "pg";
export type StoredReceipt = {
  id: string;
  organizationId: string;
  branchId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  content: Buffer;
  uploadedBy: string;
  requestKey: string;
  requestHash: string;
};
// The provider takes the authorized transaction client. A future private object
// store can implement this boundary without changing expense/business IDs.
export interface PrivateStorage {
  put(db: PoolClient, file: Omit<StoredReceipt, "id">): Promise<{ id: string }>;
  get(
    db: PoolClient,
    organizationId: string,
    id: string,
  ): Promise<StoredReceipt | undefined>;
}
export const postgresPrivateStorage: PrivateStorage = {
  async put(db, file) {
    return (
      await db.query(
        "insert into gym.private_files(organization_id,branch_id,filename,content_type,content,size_bytes,sha256,purpose,uploaded_by,request_key,request_hash) values($1,$2,$3,$4,$5,$6,$7,'expense_receipt',$8,$9,$10) returning id",
        [
          file.organizationId,
          file.branchId,
          file.filename,
          file.contentType,
          file.content,
          file.sizeBytes,
          file.sha256,
          file.uploadedBy,
          file.requestKey,
          file.requestHash,
        ],
      )
    ).rows[0];
  },
  async get(db, organizationId, id) {
    return (
      await db.query<StoredReceipt>(
        'select id,organization_id as "organizationId",branch_id as "branchId",filename,content_type as "contentType",size_bytes as "sizeBytes",sha256,content,uploaded_by as "uploadedBy",request_key as "requestKey",request_hash as "requestHash" from gym.private_files where organization_id=$1 and id=$2',
        [organizationId, id],
      )
    ).rows[0];
  },
};
