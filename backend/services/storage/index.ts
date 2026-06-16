import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || 'dummy_key';

export const supabase = createClient(supabaseUrl, supabaseKey);

export class StorageService {
  static async uploadEvidence(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<string> {
    const bucketName = process.env.SUPABASE_BUCKET || 'evidence';

    const isDummySupabase = supabaseUrl.includes('dummy.supabase.co') || supabaseKey === 'dummy_key';

    if (!isDummySupabase) {
      try {
        const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(fileName, fileBuffer, {
            contentType: mimeType,
            upsert: true,
          });

        if (!error) {
          const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(fileName);

          if (publicUrlData && publicUrlData.publicUrl) {
            return publicUrlData.publicUrl;
          }
        } else {
          console.warn(`Supabase Storage upload returned error: ${error.message}. Falling back to local storage.`);
        }
      } catch (err: any) {
        console.warn(`Supabase Storage upload failed with exception: ${err.message || err}. Falling back to local storage.`);
      }
    }

    // Fallback: local disk storage served at /api/uploads/
    try {
      const uploadDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, fileBuffer);
      console.log(`📁 Local fallback storage: Saved file to ${filePath}`);
      return `/api/uploads/${fileName}`;
    } catch (localErr: any) {
      console.warn(`Local fallback storage write failed: ${localErr.message || localErr}. Falling back to base64 data URL.`);
      return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    }
  }
}
