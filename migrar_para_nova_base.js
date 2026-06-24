const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Mapeamento das suas tabelas antigas para o campo 'grupo' da nova tabela
const mapeamento = [
    { tabela: 'cereais_e_tuberculos', nomeGrupo: 'Cereais e Tubérculos' },
    { tabela: 'frutas', nomeGrupo: 'Frutas' },
    { tabela: 'gorduras', nomeGrupo: 'Gorduras' },
    { tabela: 'leguminosas', nomeGrupo: 'Leguminosas' },
    { tabela: 'leite_e_derivados', nomeGrupo: 'Leite e Derivados' },
    { tabela: 'proteina', nomeGrupo: 'Proteínas' },
    { tabela: 'sementes', nomeGrupo: 'Sementes' },
    { tabela: 'verduras__hortali_as_e_derivados', nomeGrupo: 'Verduras e Hortaliças' }
];

async function migrar() {
    console.log("Iniciando migração...");
    
    for (const m of mapeamento) {
        try {
            // Busca todos os dados da tabela antiga
            const dadosAntigos = await prisma.$queryRawUnsafe(`SELECT * FROM \`${m.tabela}\``);
            
            if (dadosAntigos.length > 0) {
                for (const item of dadosAntigos) {
                    await prisma.alimentos_equivale.create({
                        data: {
                            Alimento: item.Alimento || "Sem nome",
                            Quantidade__g_: item['Quantidade (g)'] || 0,
                            Energia__Kcal_: item['Energia (Kcal)'] || 0,
                            grupo: m.nomeGrupo
                        }
                    });
                }
                console.log(`Sucesso: ${dadosAntigos.length} itens migrados para o grupo ${m.nomeGrupo}`);
            }
        } catch (error) {
            console.error(`Erro ao migrar tabela ${m.tabela}:`, error.message);
        }
    }
    console.log("Migração concluída!");
}

migrar();
