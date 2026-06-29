# Scripts de integração para atualizar index.html

Adicione os seguintes scripts no final do `<body>` do index.html (antes de fechar `</body>`):

```html
<!-- Sistema de módulos ES6 -->
<script type="module">
  // Importar API e app com backend
  import { api } from "./js/api.js";
  import { doLogin, STATE, navigateTo, PAGES } from "./js/app-backend.js";
  
  // Importar páginas
  import * as vendedorPages from "./js/paginas/vendedor.js";
  import * as gestorPages from "./js/paginas/gestor.js";
  import * as superPages from "./js/paginas/super.js";
  
  // Registar páginas
  PAGES["vender"] = vendedorPages.pageVender;
  PAGES["produtos-v"] = vendedorPages.pageProdutos;
  PAGES["reservar"] = vendedorPages.pageReservar;
  PAGES["dashboard"] = gestorPages.pageDashboard;
  PAGES["cadastrar"] = gestorPages.pageCadastrar;
  PAGES["stock"] = gestorPages.pageStock;
  PAGES["financas"] = gestorPages.pageFinancas;
  PAGES["funcionarios"] = gestorPages.renderFuncionarios;
  PAGES["estatisticas"] = gestorPages.pageEstatisticas;
  PAGES["reservas-g"] = gestorPages.pageReservas;
  PAGES["definicoes"] = gestorPages.pageDefinicoes;
  PAGES["empresas"] = superPages.pageEmpresas;
  PAGES["subscricoes"] = superPages.pageSubscricoes;
  PAGES["super-stats"] = superPages.pageStats;
  
  // Expor no window para acesso global
  window.doLogin = doLogin;
  window.STATE = STATE;
  window.navigateTo = navigateTo;
  window.api = api;
</script>
```

---

## Estrutura atual dos scripts

O index.html já carrega:
- Font Awesome para ícones
- CSS do style.css

Os scripts do ES6 (`api.js`, `app-backend.js`, `paginas/*.js`) serão carregados automaticamente quando você adicionar o bloco acima.

---

## Checklist de integração

- [ ] Instalar dependências: `npm install`
- [ ] Criar `.env` baseado em `.env.example`
- [ ] Criar diretório `data/`: `mkdir -p data`
- [ ] Adicionar scripts ao `index.html` (conforme acima)
- [ ] Testar com: `npm start` (Electron) ou `npm run server` (só backend)
- [ ] Fazer login com credenciais de demo
