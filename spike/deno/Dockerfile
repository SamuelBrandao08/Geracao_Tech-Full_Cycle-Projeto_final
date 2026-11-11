# Troque pela versão que o "deno --version" mostrou (evite "latest")
FROM denoland/deno:2.9.8

WORKDIR /app

# 1) Só o que define as dependências, para o cache de camadas funcionar
COPY deno.json deno.lock* ./

# 2) Código da aplicação (ajuste os caminhos à sua estrutura)
COPY . .

# 3) Baixa e compila as dependências na construção
RUN deno cache main.ts

# 4) Usuário não root (confira se existe na imagem, veja abaixo)
USER deno

EXPOSE 8000

# O ENTRYPOINT da imagem já é "deno", então só passamos os argumentos
CMD ["run", "--no-prompt", "--allow-net", "--allow-env", "--allow-sys=networkInterfaces", "main.ts"]