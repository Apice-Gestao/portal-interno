# Portal Ápice — cópia revisada

Código atual exportado em 14/10/2026, referência Git b4d060ae428bce744aa58496868bba3f71e14436.

Este pacote não contém o banco, contas, .env, segredos MFA, Git privado, dependências, builds, logs ou capturas da máquina de origem. Caminhos pessoais foram generalizados apenas nesta cópia. Inclui frontend, backend, migrações, testes, lockfile e documentação.

## Preparar no destino

Instale Node.js 22.12+ e PostgreSQL. Na pasta extraída, execute:

```powershell
npm ci
npm run db:setup
npm run dev
```

Não copie .env.example para .env antes do setup. O setup gera credenciais novas para uma instância local exclusiva. Se necessário, defina PG_BIN_DIR. Configure a própria conta inicial e o envio de e-mails conforme README.md e docs/BANCO-LOCAL.md. Não há login pronto nem cópia das contas do computador de origem. Após a preparação, o iniciador Windows funciona pela localização da pasta.

A simulação temporária da TV permanece no desenvolvimento, identificada e sem gravação no banco; consulte docs/TV-SIMULACAO-TEMPORARIA.md para removê-la. Atalhos de teste também devem ser removidos antes da VPS. O projeto continua em desenvolvimento, não pronto para produção.

A revisão está em docs/REVISAO-PACOTE-2026-10-14.md. MANIFESTO-SHA256.txt permite conferir cada arquivo do pacote (exceto o próprio manifesto). O histórico Git não está incluído; se desejar versionar esta cópia, inicialize um repositório novo.
