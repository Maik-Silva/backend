require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const multer = require("multer");
const cloudinary = require("cloudinary"); 
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Chave secreta para criptografia do Token JWT
const JWT_SECRET = process.env.JWT_SECRET || "chave_secreta_padrao_equivale_saas";

// ==========================================
//        CONFIGURAÇÃO DO CLOUDINARY + MULTER
// ==========================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dpop2y72p',
  api_key: process.env.CLOUDINARY_API_KEY || '747585153614338',
  api_secret: process.env.CLOUDINARY_API_SECRET || '6Ogf8L7dPumZmjAHA2cxW3-fd7k',
});

// ==========================================
//    MIDDLEWARES DE PROTEÇÃO DE ROTAS (JWT)
// ==========================================

// Middleware para Nutricionistas
function verificarToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Acesso negado. Faça login para continuar." });
  }

  try {
    const verificado = jwt.verify(token, JWT_SECRET);
    if (verificado.role === 'paciente') {
      return res.status(403).json({ error: "Acesso negado. Esta rota é exclusiva para nutricionistas." });
    }
    req.nutri = verificado;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Sessão expirada ou token inválido. Faça login novamente." });
  }
}

// Middleware para Pacientes
function verificarTokenPaciente(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Acesso negado. Faça login para continuar." });
  }

  try {
    const verificado = jwt.verify(token, JWT_SECRET);
    if (verificado.role !== 'paciente') {
      return res.status(403).json({ error: "Acesso inválido. Esta rota é exclusiva para pacientes." });
    }
    req.paciente = verificado;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Sessão expirada ou token inválido. Faça login novamente." });
  }
}

// Rota para gerar assinatura de upload direto
app.post('/api/nutri/upload-signature', verificarToken, (req, res) => {
  try {
    const timestamp = Math.round(Date.now() / 1000);
    
    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp: timestamp,
        folder: 'equivale_logos',
      },
      process.env.CLOUDINARY_API_SECRET || '6Ogf8L7dPumZmjAHA2cxW3-fd7k'
    );

    res.json({
      signature,
      timestamp,
      api_key: process.env.CLOUDINARY_API_KEY || '747585153614338',
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dpop2y72p',
    });
  } catch (error) {
    console.error('[SIGNATURE] Erro ao gerar assinatura:', error);
    res.status(500).json({ error: 'Erro ao gerar assinatura de upload' });
  }
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'equivale_logos',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Apenas JPG, JPEG e PNG são permitidos'));
    }
    cb(null, true);
  },
});

const tabelas = [
  "cereais_e_tuberculos",
  "frutas",
  "gorduras",
  "leguminosas",
  "leite_e_derivados",
  "proteina",
  "sementes",
  "verduras__hortali_as_e_derivados",
];

app.get("/", (req, res) => {
  res.send("Backend online com Área do Paciente! 🚀");
});

// ==========================================
//          ROTAS DE AUTENTICAÇÃO
// ==========================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { nome, email, senha, crn, chaveAcesso } = req.body;
    const CHAVE_VALIDA = process.env.CHAVE_CONVITE || "BETA100EQUIVALE";

    if (!chaveAcesso || chaveAcesso.trim() !== CHAVE_VALIDA) {
      return res.status(403).json({ error: "Chave de convite inválida ou expirada." });
    }

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios." });
    }

    const usuarioExiste = await prisma.nutricionistas.findUnique({ where: { email } });
    if (usuarioExiste) {
      return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    }

    const salt = await bcrypt.genSalt(10);
    const senha_hash = await bcrypt.hash(senha, salt);

    const novoNutri = await prisma.nutricionistas.create({
      data: {
        nome,
        email,
        senha_hash,
        crn: crn || null,
        plano: "free",
        ativo: true,
      },
    });

    res.status(201).json({ message: "Nutricionista cadastrado com sucesso!", id: novoNutri.id });
  } catch (error) {
    console.error("Erro no registro:", error);
    res.status(500).json({ error: "Erro interno ao cadastrar nutricionista." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const senhaFinal = senha || req.body.password; 

    if (!email || !senhaFinal) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    const nutri = await prisma.nutricionistas.findUnique({ where: { email } });
    if (!nutri) {
      return res.status(400).json({ error: "Credenciais inválidas." });
    }

    const senhaCorreta = await bcrypt.compare(senhaFinal, nutri.senha_hash);
    if (!senhaCorreta) {
      return res.status(400).json({ error: "Credenciais inválidas." });
    }

    if (!nutri.ativo) {
      return res.status(403).json({ error: "Sua conta está inativa. Contate o suporte." });
    }

    const token = jwt.sign(
      { id: nutri.id, email: nutri.email, role: 'nutri' },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      nutricionista: {
        id: nutri.id,
        nome: nutri.nome,
        email: nutri.email,
        crn: nutri.crn,
        plano: nutri.plano,
      },
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro interno ao realizar login." });
  }
});

// ALTERAÇÃO DE SENHA DO NUTRICIONISTA
app.post("/api/nutri/alterar-senha", verificarToken, async (req, res) => {
  try {
    const nutricionista_id = req.nutri.id;
    const { nova_senha } = req.body;

    if (!nova_senha) {
      return res.status(400).json({ error: "A nova senha é obrigatória." });
    }

    const salt = await bcrypt.genSalt(10);
    const senha_hash = await bcrypt.hash(nova_senha, salt);

    await prisma.nutricionistas.update({
      where: { id: nutricionista_id },
      data: { senha_hash },
    });

    res.json({ message: "Senha alterada com sucesso!" });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    res.status(500).json({ error: "Erro interno ao alterar senha." });
  }
});

// ==========================================
//          AUTENTICAÇÃO DO PACIENTE
// ==========================================

app.post("/api/auth/login-paciente", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    // Procura o paciente pelo e-mail
    const paciente = await prisma.pacientes.findUnique({ 
      where: { email: email.trim().toLowerCase() } 
    });

    if (!paciente) {
      return res.status(400).json({ error: "Credenciais inválidas. Verifique seu e-mail e senha." });
    }

    // Compara a senha (que por padrão é o número do telefone limpo)
    const senhaCorreta = await bcrypt.compare(senha, paciente.senha_hash);
    if (!senhaCorreta) {
      return res.status(400).json({ error: "Credenciais inválidas. Verifique seu e-mail e senha." });
    }

    // Gera o Token JWT contendo a flag 'paciente'
    const token = jwt.sign(
      { id: paciente.id, email: paciente.email, role: 'paciente' },
      JWT_SECRET,
      { expiresIn: "30d" } // Token de paciente dura mais para evitar deslogar no celular
    );

    res.json({
      token,
      paciente: {
        id: paciente.id,
        nome: paciente.nome,
        email: paciente.email,
        telefone: paciente.telefone,
      },
    });
  } catch (error) {
    console.error("Erro no login do paciente:", error);
    res.status(500).json({ error: "Erro interno ao realizar login do paciente." });
  }
});

// Rota de Perfil Exclusiva do Paciente (Para puxar os dados dele + marca do nutri)
app.get("/api/pacientes/perfil", verificarTokenPaciente, async (req, res) => {
  try {
    const paciente_id = req.paciente.id;

    const dadosPaciente = await prisma.pacientes.findUnique({
      where: { id: paciente_id },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        data_nascimento: true,
        observacoes: true,
        // Traz as informações de personalização e marca do Nutricionista dele
        nutricionista: {
          select: {
            nome: true,
            crn: true,
            especialidade: true,
            whatsapp: true,
            instagram: true,
            logo_url: true,
          }
        }
      }
    });

    if (!dadosPaciente) {
      return res.status(404).json({ error: "Paciente não encontrado." });
    }

    res.json(dadosPaciente);
  } catch (error) {
    console.error("Erro ao buscar perfil do paciente:", error);
    res.status(500).json({ error: "Erro interno ao buscar dados do paciente." });
  }
});

// ==========================================
//    ROTA EXCLUSIVA DE UPLOAD DE LOGO (MULTER)
// ==========================================
app.post('/api/nutri/upload-logo', verificarToken, (req, res) => {
  console.log('[UPLOAD] ⏱  Iniciando upload via Multer...');
  const startTime = Date.now();

  const uploadTimeout = setTimeout(() => {
    console.error('[UPLOAD] ❌ Timeout no upload (>25s)');
    if (!res.headersSent) {
      res.status(408).json({ error: 'Upload demorou muito. Tente novamente.' });
    }
  }, 25000);

  upload.single('logo')(req, res, (err) => {
    clearTimeout(uploadTimeout);
    const uploadTime = Date.now() - startTime;
    console.log(`[UPLOAD] ✏️  Multer processou em ${uploadTime}ms`);

    if (err) {
      console.error(`[UPLOAD] ❌ Erro do Multer (${uploadTime}ms):`, err.message);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Arquivo muito grande (máximo 10MB)', code: 'LIMIT_FILE_SIZE' });
        }
        return res.status(400).json({ error: err.message, code: err.code });
      }
      return res.status(400).json({ error: err.message || 'Erro no processamento do upload' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo de imagem foi enviado.' });
    }

    try {
      const logoUrl = req.file.path || req.file.secure_url || req.file.url || null;
      if (!logoUrl) {
        return res.status(500).json({ error: 'Upload concluído, mas URL não foi recuperada.' });
      }
      return res.json({ logo_url: logoUrl, uploadTime: `${Date.now() - startTime}ms` });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao processar resposta do upload.' });
    }
  });
});

// ==========================================
//        ROTAS DE GESTÃO DE PACIENTES
// ==========================================

app.post("/api/pacientes", verificarToken, async (req, res) => {
  try {
    const { nome, email, telefone, data_nascimento, observacoes } = req.body;
    const nutricionista_id = req.nutri.id;

    if (!nome || !email || !telefone || !data_nascimento) {
      return res.status(400).json({ error: "Nome, E-mail, Telefone e Data de Nascimento são obrigatórios." });
    }

    const senhaPura = telefone.replace(/\D/g, ""); 
    const salt = await bcrypt.genSalt(10);
    const senha_hash = await bcrypt.hash(senhaPura, salt);

    const novoPaciente = await prisma.pacientes.create({
      data: {
        nutricionista_id,
        nome,
        email: email.trim().toLowerCase(),
        telefone,
        senha_hash, 
        data_nascimento: data_nascimento ? new Date(data_nascimento) : null,
        observacoes: observacoes || null,
      },
    });

    const urlAcesso = `https://equivale-saas.vercel.app/login?usuario=${encodeURIComponent(novoPaciente.email)}`;

    res.status(201).json({ 
      message: "Paciente cadastrado com sucesso!", 
      paciente: novoPaciente,
      acesso: { usuario: novoPaciente.email, senha_inicial: senhaPura, link: urlAcesso }
    });
  } catch (error) {
    console.error("Erro ao cadastrar paciente:", error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: "Este e-mail de paciente já está cadastrado no sistema." });
    }
    res.status(500).json({ error: "Erro interno ao cadastrar paciente." });
  }
});

app.get("/api/pacientes", verificarToken, async (req, res) => {
  try {
    const nutricionista_id = req.nutri.id;
    const listaPacientes = await prisma.pacientes.findMany({
      where: { nutricionista_id },
      orderBy: { nome: "asc" },
    });
    res.json(listaPacientes);
  } catch (error) {
    console.error("Erro ao buscar pacientes:", error);
    res.status(500).json({ error: "Erro interno ao listar pacientes." });
  }
});

app.put("/api/pacientes/:id", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, email, telefone, data_nascimento, observacoes } = req.body;
    const nutricionista_id = req.nutri.id;

    const pacienteAtualizado = await prisma.pacientes.update({
      where: { 
        id: parseInt(id),
        nutricionista_id
      },
      data: {
        nome,
        email: email ? email.trim().toLowerCase() : undefined,
        telefone,
        data_nascimento: data_nascimento ? new Date(data_nascimento) : null,
        observacoes: observacoes || null,
      },
    });

    res.json({ message: "Dados do paciente atualizados com sucesso!", paciente: pacienteAtualizado });
  } catch (error) {
    console.error("Erro ao atualizar paciente:", error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: "Este e-mail já está sendo utilizado por outro paciente." });
    }
    res.status(500).json({ error: "Erro interno ao atualizar dados do paciente." });
  }
});

app.delete("/api/pacientes/:id", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const nutricionista_id = req.nutri.id;

    await prisma.pacientes.delete({
      where: { 
        id: parseInt(id),
        nutricionista_id
      },
    });

    res.json({ message: "Paciente excluído com sucesso!" });
  } catch (error) {
    console.error("Erro ao excluir paciente:", error);
    res.status(500).json({ error: "Erro interno ao excluir paciente." });
  }
});

// ==========================================
//      ROTAS DE PERSONALIZAÇÃO DO PERFIL
// ==========================================

app.put("/api/nutri/perfil", verificarToken, async (req, res) => {
  try {
    const nutricionista_id = req.nutri.id;
    const { especialidade, whatsapp, instagram, logo_url, nome, crn } = req.body;

    const nutriAtualizado = await prisma.nutricionistas.update({
      where: { id: nutricionista_id },
      data: {
        nome, 
        especialidade: especialidade || null,
        whatsapp: whatsapp || null,
        instagram: instagram || null,
        logo_url: logo_url || null,
        crn: crn || null, 
      },
    });

    res.json({
      message: "Configurações de personalização salvas com sucesso!",
      nutricionista: {
        id: nutriAtualizado.id,
        nome: nutriAtualizado.nome,
        email: nutriAtualizado.email,
        crn: nutriAtualizado.crn, 
        especialidade: nutriAtualizado.especialidade,
        whatsapp: nutriAtualizado.whatsapp,
        instagram: nutriAtualizado.instagram,
        logo_url: nutriAtualizado.logo_url,
      },
    });
  } catch (error) {
    console.error("Erro ao salvar personalização:", error);
    res.status(500).json({ error: "Erro interno ao salvar personalização." });
  }
});

app.get("/api/nutri/perfil", verificarToken, async (req, res) => {
  try {
    const nutricionista_id = req.nutri.id;
    const nutri = await prisma.nutricionistas.findUnique({
      where: { id: nutricionista_id },
      select: {
        id: true,
        nome: true,
        email: true,
        crn: true,
        especialidade: true,
        whatsapp: true,
        instagram: true,
        logo_url: true,
        plano: true,
      },
    });
    res.json(nutri);
  } catch (error) {
    console.error("Erro ao buscar perfil:", error);
    res.status(500).json({ error: "Erro interno ao buscar perfil." });
  }
});

// ==========================================
//          ROTAS ALIMENTARES EXISTENTES
// ==========================================

async function buscarAlimento(nomeAlimento) {
  const nomeLower = nomeAlimento.toLowerCase().trim();
  for (const tabela of tabelas) {
    try {
      const alimentos = await prisma[tabela].findMany({
        select: { Alimento: true, Energia__Kcal_: true, Quantidade__g_: true },
      });
      if (!alimentos || alimentos.length === 0) continue;
      const alimentoEncontrado = alimentos.find((alimento) =>
        alimento.Alimento && alimento.Alimento.toLowerCase().includes(nomeLower)
      );
      if (alimentoEncontrado) return { ...alimentoEncontrado, group: tabela };
    } catch (error) {
      console.error(`Erro ao buscar na tabela ${tabela}:`, error);
    }
  }
  return null;
}

app.get("/api/sugestoes", async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "O parâmetro 'query' é obrigatório" });
  const nomeLower = query.toLowerCase().trim();
  let resultados = [];
  try {
    for (const tabela of tabelas) {
      const alimentos = await prisma[tabela].findMany({
        where: { Alimento: { contains: nomeLower } },
        select: { Alimento: true },
        take: 10,
      });
      resultados = [...resultados, ...alimentos.map((a) => a.Alimento)];
    }
    if (resultados.length === 0) return res.status(404).json({ error: "Nenhum alimento encontrado" });
    res.json({ sugestoes: resultados });
  } catch (error) {
    console.error("Erro ao buscar suggestions:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

app.get("/api/equivalencia", async (req, res) => {
  const { baseFood, baseQuantity, substituteFood } = req.query;
  if (!baseFood || !baseQuantity || !substituteFood) return res.status(400).json({ error: "Parâmetros inválidos" });
  try {
    const base = await buscarAlimento(baseFood);
    const substitute = await buscarAlimento(substituteFood);
    if (!base || !substitute) return res.status(404).json({ error: "Alimento não encontrado" });
    const baseCalories = base.Energia__Kcal_ || base.Calorias || base.Kcal;
    const substituteCalories = substitute.Energia__Kcal_ || substitute.Calorias || substitute.Kcal;
    if (!baseCalories || !substituteCalories) return res.status(500).json({ error: "Erro ao obter calorias dos alimentos" });
    const equivalentQuantity = (baseQuantity * baseCalories) / substituteCalories;
    
    res.json({
      baseFood,
      baseQuantity,
      substituteFood,
      equivalentQuantity: equivalentQuantity.toFixed(2),
      baseGroup: base.group,
      substituteGroup: substitute.group,
    });
  } catch (error) {
    console.error("Erro ao buscar equivalência:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

async function testDatabase() {
  for (const tabela of tabelas) {
    try {
      await prisma[tabela].findFirst();
      console.log(`✅ Conexão com ${tabela} bem-sucedida!`);
    } catch (error) {
      console.error(`❌ Erro ao conectar com ${tabela}:`, error);
    }
  }
}
testDatabase();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
