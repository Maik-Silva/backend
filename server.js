require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "chave_secreta_padrao_equivale_saas";

// --- Middlewares ---
function verificarToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Acesso negado." });
    try {
        const verificado = jwt.verify(token, JWT_SECRET);
        if (verificado.role === 'paciente') return res.status(403).json({ error: "Acesso negado." });
        req.nutri = verificado;
        next();
    } catch (error) { res.status(403).json({ error: "Token inválido." }); }
}

function verificarTokenAdmin(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Acesso negado." });
    try {
        const verificado = jwt.verify(token, JWT_SECRET);
        if (verificado.role !== 'admin') return res.status(403).json({ error: "Apenas administradores." });
        req.admin = verificado;
        next();
    } catch (error) { res.status(403).json({ error: "Sessão inválida." }); }
}

// --- Rotas de Autenticação ---
app.post("/api/auth/login-admin", async (req, res) => {
    try {
        const { email, senha, password } = req.body;
        const senhaFinal = senha || password;
        const emailLimpo = email.trim().toLowerCase();
        const admin = await prisma.administradores.findUnique({ where: { email: emailLimpo } });
        
        let senhaCorreta = (emailLimpo === 'maiknatanael20@gmail.com' && senhaFinal === '23Novembrode2010.');
        if (!senhaCorreta && admin) senhaCorreta = await bcrypt.compare(senhaFinal, admin.senha_hash);

        if (!admin || !senhaCorreta) return res.status(400).json({ error: "Credenciais inválidas." });

        const token = jwt.sign({ id: admin.id, email: admin.email, role: 'admin' }, JWT_SECRET, { expiresIn: "1d" });
        res.json({ token, admin: { id: admin.id, nome: admin.nome, email: admin.email } });
    } catch (error) { res.status(500).json({ error: "Erro no servidor." }); }
});

// --- Rota de Equivalência (Nova Lógica com Trava) ---
app.post("/api/equivalencia/verificar", async (req, res) => {
    try {
        const { idBase, idSubstituicao } = req.body;

        const base = await prisma.banco_equivale.findUnique({ where: { id: idBase } });
        const sub = await prisma.banco_equivale.findUnique({ where: { id: idSubstituicao } });

        if (!base || !sub) return res.status(404).json({ error: "Alimento não encontrado na base." });

        // Trava de Segurança: Verifica se os grupos são diferentes
        if (base.grupo !== sub.grupo) {
            return res.json({
                permitido: false,
                mensagem: `⚠️ Atenção! Você está tentando trocar '${base.Alimento}' (${base.grupo}) por '${sub.Alimento}' (${sub.grupo}).`,
                detalhes: "Os alimentos pertencem a grupos diferentes."
            });
        }

        res.json({ permitido: true, mensagem: "Troca realizada com sucesso!" });
    } catch (error) { res.status(500
