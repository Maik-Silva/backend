# Usando a imagem oficial do Node.js
FROM node:18

# Diretório de trabalho dentro do container
WORKDIR /app

# Copiando arquivos de dependência
COPY package*.json ./

# Instalando dependências
RUN npm install

# Copiando o restante dos arquivos do projeto
COPY . .

# Adicionando permissão de execução para o Prisma CLI
RUN chmod +x node_modules/.bin/prisma

# Gerando o Prisma Client
RUN npx prisma generate

# Rodando as migrações do Prisma durante a construção
RUN npx prisma migrate deploy

# Expondo a porta (ajuste conforme necessário)
EXPOSE 5000

# Comando de inicialização
CMD ["npm", "run", "start"]
