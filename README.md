# Orla — Sistema de agendamento

Agenda de um estúdio fictício com três profissionais e seis serviços. Interface em português, feita com HTML, CSS e JavaScript, sem dependências de interface.

**Site:** https://alexmanhes.github.io/orla-agenda/

## Funcionalidades

- Agenda diária em grade ou lista, com navegação por data e filtro por profissional.
- Cadastro, edição e reagendamento de atendimentos.
- Horários disponíveis calculados conforme profissional, duração do serviço, reservas existentes e intervalos.
- Confirmação de reservas e conclusão após o término do atendimento.
- Cancelamento com motivo e preservação do histórico; a vaga é liberada imediatamente.
- Catálogo de serviços com edição de preço e duração.
- Expediente semanal e intervalos configuráveis por profissional.
- Histórico pesquisável, filtros por data/status e indicadores diários.
- Salvamento no navegador e exportação em JSON.

## Regras de datas e conflitos

Todos os horários usam o fuso **America/Sao_Paulo**. Datas são representadas como `YYYY-MM-DD`, com validação de calendário real. Os horários usam `HH:mm`, em passos de 15 minutos.

Um atendimento deve caber integralmente no expediente e não pode atravessar o intervalo do profissional. Reservas confirmadas, pendentes e concluídas ocupam o horário. Os intervalos são semiabertos: uma reserva pode começar exatamente quando a anterior termina. Profissionais diferentes podem atender simultaneamente.

Novas reservas e reagendamentos são permitidos de agora até 365 dias adiante. Informações de contato de um atendimento passado podem ser corrigidas sem alterar sua data. A conclusão só é permitida após o horário de término. Cancelamentos exigem um motivo e ficam no histórico.

Mudar o catálogo preserva o preço e a duração combinados nas reservas existentes. Alterar a disponibilidade é rejeitado quando deixaria uma reserva futura fora do novo expediente.

## Executar e verificar

Com Node.js instalado:

```sh
node serve.cjs
```

Abra http://127.0.0.1:8791/.

```sh
node --check dist/js/app.js
node tests/model.cjs
```

Os testes incluem sobreposição, reservas adjacentes, almoço, fim do expediente, cancelamento, datas inválidas, virada de mês/ano, fuso horário, preços/durações preservados, alterações de expediente e conclusão futura.

## Organização

```text
dist/index.html       Estrutura da aplicação
dist/css/styles.css   Estilos responsivos
dist/js/model.js      Dados e regras de negócio
dist/js/app.js        Interface e persistência
tests/model.cjs       Testes das regras
serve.cjs             Prévia local
```

## Publicação

O workflow em `.github/workflows/pages.yml` verifica as regras de negócio e publica a pasta `dist` no GitHub Pages a cada atualização na branch `main`. Em **Settings → Pages**, a fonte de publicação é **GitHub Actions**.

## Armazenamento

Esta versão é uma demonstração com dados fictícios e armazenamento local. Não possui autenticação nem banco de dados compartilhado. Os registros ficam no navegador em que foram criados, não são sincronizados entre dispositivos e podem ser removidos ao limpar os dados do site. O botão **Exportar dados** salva uma cópia em JSON; a importação de cópias ainda não tem interface.

A prevenção de conflitos funciona sobre os dados carregados nessa sessão. Um uso real com vários atendentes exige um servidor que valide as reservas de forma atômica.
