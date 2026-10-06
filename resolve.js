const fs = require('fs');

function resolveKeepBoth(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Custom logic for user.controller.ts
  if (filePath.includes('user.controller.ts')) {
    content = content.replace(/<<<<<<< HEAD\r?\n/g, '');
    content = content.replace(/=======\r?\n/g, '    );\n  }\n\n  /*\n');
    content = content.replace(/>>>>>>> origin\/develop\r?\n/g, '');
  } 
  else if (filePath.includes('user.routes.ts')) {
    content = content.replace(/<<<<<<< HEAD\r?\n/g, '');
    content = content.replace(/=======\r?\n/g, '');
    content = content.replace(/>>>>>>> origin\/develop\r?\n/g, '');
  }
  else if (filePath.includes('AccountManagement.tsx')) {
    content = content.replace(/<<<<<<< HEAD\r?\n/g, '');
    content = content.replace(/=======\r?\n/g, '');
    content = content.replace(/>>>>>>> origin\/develop\r?\n/g, '');
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Resolved ${filePath}`);
}

resolveKeepBoth('be/src/modules/users/user.controller.ts');
resolveKeepBoth('be/src/modules/users/user.routes.ts');
resolveKeepBoth('fe/src/pages/AccountManagement.tsx');
