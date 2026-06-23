// gerar-hash-admin.js
const bcrypt = require('bcryptjs');

// 1️⃣ Defina a sua senha aqui
const SENHA_ADMIN = "23Novembrode2010."; 
const EMAIL_ADMIN = "maiknatanael20@gmail.com";

async function gerar() {
  console.log("--------------------------------------------------");
  console.log(`🔐 Gerando hash para a senha: "${SENHA_ADMIN}"...`);
  
  // Gera o salt e o hash usando o bcryptjs puro do seu server
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(SENHA_ADMIN, salt);
  
  console.log("\n✅ HASH GERADO COM SUCESSO:");
  console.log(hash);
  console.log("--------------------------------------------------");
  
  console.log("\n📋 COMANDO SQL PRONTO PARA COPIAR:");
  console.log(`UPDATE administradores SET senha_hash = '${hash}' WHERE email = '${EMAIL_ADMIN}';`);
  console.log("--------------------------------------------------");

  // 🧪 Teste de validação em tempo real
  const valido = await bcrypt.compare(SENHA_ADMIN, hash);
  console.log(`\n🧪 Teste de validação local: ${valido ? "🟢 FUNCIONOU!" : "🔴 FALHOU!"}`);
  console.log("--------------------------------------------------");
}

gerar();
