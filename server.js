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
const prisma = new PrismaClient({
  // Otimizações de conexão
  log: ['error', 'warn'],
});

// Middleware de CORS mais otimizado
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Timeout global para requisições lentas
app.use((req, res, next) => {
  // 30 segundos de timeout
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

// Chave secreta para criptografia do Token JWT
const JWT_SECRET = process.env.JWT_SECRET || "chave_secreta_padrao_equivale_saas";

// ==========================================
//       CONFIGURAÇÃO DO CLOUDINARY + MULTER
// ==========================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dpop2y72p',
  api_key: process.env.CLOUDINARY_API_KEY || '747585153614338',
  api_secret: process.env.CLOUDINARY_API_SECRET || '6Ogf8L7dPumZmjAHA2cxW3-fd7k',
  timeout: 30000, // Timeout do Cloudinary
});

// Configuração de storage otimizada
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'equivale_logos',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    resource_type: 'auto',
    eager: [], // Não fazer transformações durante upload
  },
});

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Validação rápida do tipo de arquivo
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

// Cache simples para alimentos (5 minutos)
let alimentosCache = {};
let cacheExpiry = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Rota raiz para teste simples
app.get("/", (req, res) => {
  res.send("Backend online com Upload de Imagens! 🚀");
});

// ==========================================
//          ROTAS DE AUTENTICAÇÃO
// ==========================================

// 1. Rota para Registrar um Novo Nutricionista
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

    // Validação básica de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "E-mail inválido." });
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

// 2. Rota para Login do Nutricionista
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
      { id: nutri.id, email: nutri.email },
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

// ==========================================
//    MIDDLEWARE DE PROTEÇÃO DE ROTAS (JWT)
// ==========================================

function verificarToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Acesso negado. Faça login para continuar." });
  }

  try {
    const verificado = jwt.verify(token, JWT_SECRET);
    req.nutri = verificado;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Sessão expirada ou token inválido. Faça login novamente." });
  }
}

// ==========================================
//        ROTA EXCLUSIVA DE UPLOAD DE LOGO
// ==========================================
app.post('/api/nutri/upload-logo', verificarToken, (req, res) => {
  console.log('[UPLOAD] ⏱️  Iniciando upload...');
  const startTime = Date.now();

  // Timeout de 25 segundos apenas para upload
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

    // Erro do Multer
    if (err) {
      console.error(`[UPLOAD] ❌ Erro do Multer (${uploadTime}ms):`, err.message);
      
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ 
            error: 'Arquivo muito grande (máximo 10MB)',
            code: 'LIMIT_FILE_SIZE'
          });
        }
        return res.status(400).json({ 
          error: err.message,
          code: err.code 
        });
      }
      
      return res.status(400).json({ 
        error: err.message || 'Erro no processamento do upload'
      });
    }

    // Validar arquivo
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo de imagem foi enviado.' });
    }

    console.log('[UPLOAD] 📁 Arquivo recebido:', {
      fieldname: req.file.fieldname,
      filename: req.file.filename,
      size: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
      uploadTime: `${uploadTime}ms`
    });

    try {
      // Extrair URL com fallbacks
      const logoUrl = req.file.path || req.file.secure_url || req.file.url || null;

      if (!logoUrl) {
        console.error('[UPLOAD] ❌ URL não encontrada em req.file');
        return res.status(500).json({ error: 'Upload concluído, mas URL não foi recuperada.' });
      }

      const totalTime = Date.now() - startTime;
      console.log(`[UPLOAD] ✅ Sucesso! (tempo total: ${totalTime}ms)`);
      
      return res.json({ 
        logo_url: logoUrl,
        uploadTime: `${totalTime}ms`
      });
    } catch (error) {
      console.error('[UPLOAD] ❌ Erro ao processar resposta:', error);
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

    if (!nome) {
      return res.status(400).json({ error: "O nome do paciente é obrigatório." });
    }

    const novoPaciente = await prisma.pacientes.create({
      data: {
        nutricionista_id,
        nome,
        email: email || null,
        telefone: telefone || null,
        data_nascimento: data_nascimento ? new Date(data_nascimento) : null,
        observacoes: observacoes || null,
      },
    });

    res.status(201).json({ message: "Paciente cadastrado com sucesso!", paciente: novoPaciente });
  } catch (error) {
    console.error("Erro ao cadastrar paciente:", error);
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

// ==========================================
//      ROTAS DE PERSONALIZAÇÃO DO PERFIL
// ==========================================

app.put("/api/nutri/perfil", verificarToken, async (req, res) => {
  try {
    const nutricionista_id = req.nutri.id;
    const { especialidade, whatsapp, instagram, logo_url, nome } = req.body;

    const nutriAtualizado = await prisma.nutricionistas.update({
      where: { id: nutricionista_id },
      data: {
        nome, 
        especialidade: especialidade || null,
        whatsapp: whatsapp || null,
        instagram: instagram || null,
        logo_url: logo_url || null,
      },
    });

    res.json({
      message: "Configurações de personalização salvas com sucesso!",
      nutricionista: {
        id: nutriAtualizado.id,
        nome: nutriAtualizado.nome,
        email: nutriAtualizado.email,
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
      // Usar where para filtrar no banco, não em memória
      const alimentos = await prisma[tabela].findMany({
        where: { 
          Alimento: { 
            contains: nomeLower,
            mode: 'insensitive' // Case-insensitive search
          } 
        },
        select: { 
          Alimento: true, 
          Energia__Kcal_: true, 
          Quantidade__g_: true 
        },
        take: 1, // Pegar apenas o primeiro
      });
      
      if (alimentos && alimentos.length > 0) {
        return { ...alimentos[0], group: tabela };
      }
    } catch (error) {
      console.error(`Erro ao buscar na tabela ${tabela}:`, error);
    }
  }
  return null;
}

app.get("/api/sugestoes", async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: "O parâmetro 'query' é obrigatório" });
    
    const nomeLower = query.toLowerCase().trim();
    let resultados = [];
    
    // Limitar a buscas em paralelo para melhor performance
    const promessas = tabelas.map(async (tabela) => {
      try {
        const alimentos = await prisma[tabela].findMany({
          where: { 
            Alimento: { 
              contains: nomeLower,
              mode: 'insensitive'
            } 
          },
          select: { Alimento: true },
          take: 5, // Reduzido de 10 para 5
        });
        return alimentos.map((a) => a.Alimento);
      } catch (error) {
        console.error(`Erro ao buscar sugestões na tabela ${tabela}:`, error);
        return [];
      }
    });
    
    const resultadosPorTabela = await Promise.all(promessas);
    resultados = resultadosPorTabela.flat();
    
    if (resultados.length === 0) {
      return res.status(404).json({ error: "Nenhum alimento encontrado" });
    }
    
    // Remover duplicatas
    const resultadosUnicos = [...new Set(resultados)];
    res.json({ sugestoes: resultadosUnicos.slice(0, 20) }); // Máximo 20 resultados
  } catch (error) {
    console.error("Erro ao buscar sugestões:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

app.get("/api/equivalencia", async (req, res) => {
  try {
    const { baseFood, baseQuantity, substituteFood } = req.query;
    
    if (!baseFood || !baseQuantity || !substituteFood) {
      return res.status(400).json({ error: "Parâmetros inválidos" });
    }
    
    // Buscar em paralelo
    const [base, substitute] = await Promise.all([
      buscarAlimento(baseFood),
      buscarAlimento(substituteFood)
    ]);
    
    if (!base || !substitute) {
      return res.status(404).json({ error: "Alimento não encontrado" });
    }
    
    const baseCalories = base.Energia__Kcal_ || base.Calorias || base.Kcal;
    const substituteCalories = substitute.Energia__Kcal_ || substitute.Calorias || substitute.Kcal;
    
    if (!baseCalories || !substituteCalories) {
      return res.status(500).json({ error: "Erro ao obter calorias dos alimentos" });
    }
    
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
  console.log("[DB] Testando conexões com banco de dados...");
  for (const tabela of tabelas) {
    try {
      await prisma[tabela].findFirst();
      console.log(`✅ Conexão com ${tabela} bem-sucedida!`);
    } catch (error) {
      console.error(`❌ Erro ao conectar com ${tabela}:`, error.message);
    }
  }
}
testDatabase();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM recebido, fechando servidor...');
  prisma.$disconnect().then(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('SIGINT recebido, fechando servidor...');
  prisma.$disconnect().then(() => process.exit(0));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
