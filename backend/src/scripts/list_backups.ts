import fs from 'fs';
import path from 'path';

function getBackupDir(): string {
  const currentDrive = path.parse(path.resolve("./")).root;
  const exactPathOnCurrentDrive = path.join(currentDrive, "FOTOS_ARHIVOS_ADMISION_CEPRU", "Documentos_Admision");
  if (fs.existsSync(exactPathOnCurrentDrive)) {
    return path.join(exactPathOnCurrentDrive, "respaldo_nube");
  }
  return "H:\\FOTOS_ARHIVOS_ADMISION_CEPRU\\Documentos_Admision\\respaldo_nube";
}

const backupDir = getBackupDir();
console.log(`Backup Directory resolved to: ${backupDir}`);

if (fs.existsSync(backupDir)) {
  try {
    const folders = fs.readdirSync(backupDir);
    console.log(`Folders in backup directory:`, folders);
    for (const folder of folders) {
      const folderPath = path.join(backupDir, folder);
      if (fs.statSync(folderPath).isDirectory()) {
        const files = fs.readdirSync(folderPath);
        console.log(`  Folder '${folder}' has ${files.length} files. (first 5: ${files.slice(0, 5).join(', ')})`);
      }
    }
  } catch(e) {
    console.error(`Error reading directory:`, e);
  }
} else {
  console.log(`Backup directory does not exist!`);
}
