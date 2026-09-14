const fs = require('fs');
const path = require('path');

function backupDatabase(destDir) {
  const source = path.join(__dirname, '../library.db');
  
  if (!fs.existsSync(source)) {
    throw new Error('Source database file library.db does not exist.');
  }

  // Use specified directory or default to a backups folder in project root
  const targetDir = destDir || path.join(__dirname, '../backups');
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '_')
    .replace(/\..+/, '')
    .replace(/:/g, '-'); // YYYY-MM-DD_HH-MM-SS
  
  const destFile = `library_backup_${timestamp}.db`;
  const destPath = path.join(targetDir, destFile);

  fs.copyFileSync(source, destPath);
  return destPath;
}

// Support running directly from command line
if (require.main === module) {
  try {
    const dest = process.argv[2];
    const result = backupDatabase(dest);
    console.log(`Backup successful! Saved to: ${result}`);
  } catch (error) {
    console.error('Backup failed:', error.message);
    process.exit(1);
  }
}

module.exports = backupDatabase;
