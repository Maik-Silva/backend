const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const configuracao = [
    { modelo: 'cereais_e_tuberculos', nomeGrupo: 'Cereais e Tubérculos' },
    { modelo: 'frutas', nomeGrupo: 'Frutas' },
    { modelo: 'gorduras', nomeGrupo: 'Gorduras' },
    { modelo: 'leguminosas', nomeGrupo: 'Leguminosas' },
    { modelo: 'leite_e_derivados', nomeGrupo: 'Leite e Derivados' },
    { modelo: 'proteina', nomeGrupo: 'Proteínas' },
    { modelo: 'sementes', nomeGrupo: 'Sementes' },
    { modelo: 'verduras__hortali_as_e_derivados', nomeGrupo: 'Verduras e Hortaliças' }
];

async function migrar() {
    console.log("Iniciando migração para 'banco_equivale'...");
    
    for (const item of configuracao) {
        try {
            const registros = await prisma[item.modelo].findMany();
            for (const reg of registros) {
                await prisma.banco_equivale.create({
                    data: {
                        Alimento: reg.Alimento || "Sem nome",
                        Quantidade__g_: reg.Quantidade__g_ || 0,
                        Energia__Kcal_: reg.Energia__Kcal_ || 0,
                        grupo: item.nomeGrupo
                    }
                });
            }
            console.log(`Sucesso: ${item.nomeGrupo} migrado.`);
        } catch (error) {
            console.error(`Erro ao migrar ${item.modelo}:`, error.message);
        }
    }
    console.log("Migração finalizada!");
    await prisma.$disconnect();
}
migrar();
