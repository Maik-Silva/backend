const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(cors());

const tabelas = [
    "cereais_e_tuberculos",
    "frutas",
    "gorduras",
    "leguminosas",
    "leite_e_derivados",
    "proteina",
    "sementes",
    "verduras__hortali_as_e_derivados"
];

// 🔍 Função para buscar alimento no banco de dados e retornar a tabela correspondente
async function buscarAlimento(nomeAlimento) {
    const nomeLower = nomeAlimento.toLowerCase().trim();

    for (const tabela of tabelas) {
        console.log(`🔍 Buscando "${nomeAlimento}" na tabela ${tabela}...`);

        try {
            const alimentos = await prisma[tabela].findMany({
                select: { Alimento: true, Energia__Kcal_: true, Quantidade__g_: true },
            });

            if (!alimentos || alimentos.length === 0) {
                console.log(`⚠️ Nenhum alimento encontrado na tabela ${tabela}`);
                continue;
            }

            const alimentoEncontrado = alimentos.find(alimento =>
                alimento.Alimento && alimento.Alimento.toLowerCase().includes(nomeLower)
            );

            if (alimentoEncontrado) {
                console.log(`✅ Alimento encontrado: ${alimentoEncontrado.Alimento} (Grupo: ${tabela})`);
                return { ...alimentoEncontrado, grupo: tabela }; // Adiciona o nome do grupo
            }

        } catch (error) {
            console.error(`❌ Erro ao buscar na tabela ${tabela}:`, error);
        }
    }

    console.log(`❌ Alimento "${nomeAlimento}" não encontrado em nenhuma tabela.`);
    return null;
}

// 🔍 Rota para buscar sugestões de alimentos
app.get("/api/sugestoes", async (req, res) => {
    const { query } = req.query;

    if (!query) {
        return res.status(400).json({ error: "O parâmetro 'query' é obrigatório" });
    }

    const nomeLower = query.toLowerCase().trim();
    let resultados = [];

    try {
        for (const tabela of tabelas) {
            const alimentos = await prisma[tabela].findMany({
                where: {
                    Alimento: {
                        contains: nomeLower
                    }
                },
                select: { Alimento: true },
                take: 10 // Limita a 10 sugestões por tabela
            });

            resultados = [...resultados, ...alimentos.map(alimento => alimento.Alimento)];
        }

        if (resultados.length === 0) {
            return res.status(404).json({ error: "Nenhum alimento encontrado" });
        }

        res.json({ sugestoes: resultados });

    } catch (error) {
        console.error("Erro ao buscar sugestões:", error);
        res.status(500).json({ error: "Erro interno no servidor" });
    }
});


// 🥄 Rota para calcular equivalência
app.get("/api/equivalencia", async (req, res) => {
    console.log("Parâmetros recebidos:", req.query);

    const { baseFood, baseQuantity, substituteFood } = req.query;

    if (!baseFood || !baseQuantity || !substituteFood) {
        return res.status(400).json({ error: "Parâmetros inválidos" });
    }

    try {
        const base = await buscarAlimento(baseFood);
        const substitute = await buscarAlimento(substituteFood);

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
            baseGroup: base.grupo, // Nome do grupo (tabela) do alimento base
            substituteGroup: substitute.grupo // Nome do grupo (tabela) do substituto
        });

    } catch (error) {
        console.error("Erro ao buscar equivalência:", error);
        res.status(500).json({ error: "Erro interno no servidor" });
    }
});

// 🔍 Teste de conexão com o banco de dados
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

