//! InternalStorageService
//! SPDX-FileCopyright: esurio <esurio@esurio1673.net>

#[derive(Debug, Clone, Copy)]
pub struct InternalStorageService;

// TODO: Box<dyn std::error::Error>からInternalStorageErrorに移行する?
#[derive(Debug, Clone, Copy)]
pub enum InternalStorageServiceError {}

// TODO: エラー用のenumを作る
impl InternalStorageService {
    pub fn resolve_path(
        &self,
        key: &String,
    ) -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
        let pwd = std::env::current_dir()?;
        let storage_path = pwd.join("files");
        Ok(storage_path.join(key))
    }

    pub async fn del(&self, key: String) -> Result<(), Box<dyn std::error::Error>> {
        let item = Self.resolve_path(&key)?;

        match tokio::fs::remove_file(item).await {
            Ok(_) => Ok(()),
            Err(e) => {
                if e.kind() == std::io::ErrorKind::NotFound {
                    Ok(())
                } else {
                    eprintln!("Error while deleting items: {}", e);
                    Err(Box::new(e))
                }
            }
        }
    }

    pub async fn save_from_path(
        &self,
        key: String,
        src_path: impl AsRef<std::path::Path>,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let save_path = self.resolve_path(&key)?;

        if let Some(parents) = save_path.parent() {
            tokio::fs::create_dir_all(parents).await?;
        }

        tokio::fs::copy(src_path, &save_path).await?;

        let result = format!("/files/{}", &key);
        Ok(result)
    }

    pub async fn save_from_buffer(
        &self,
        key: String,
        data: &[u8],
    ) -> Result<String, Box<dyn std::error::Error>> {
        let save_path = self.resolve_path(&key)?;

        if let Some(parents) = save_path.parent() {
            tokio::fs::create_dir_all(parents).await?;
        }

        tokio::fs::write(save_path, data).await?;

        let result = format!("/files/{}", &key);
        Ok(result)
    }
}
