FROM denoland/deno:2.9.8

WORKDIR /app

RUN chown -R deno:deno /app
USER deno

COPY --chown=deno:deno deno.json deno.lock* ./

COPY --chown=deno:deno . .

RUN deno cache src/main.ts

ENV PORT=3000
EXPOSE 3000

CMD ["run", "--no-prompt", "--allow-net", "--allow-env", "--allow-sys=networkInterfaces,hostname", "src/main.ts"]