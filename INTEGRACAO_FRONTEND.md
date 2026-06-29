# 🔌 Como Integrar o Backend no Frontend

Este ficheiro mostra como conectar o frontend (index.html) com o novo backend integrado.

---

## 1️⃣ Importar os Scripts

No final do `<body>` do seu `index.html`, adicione:

```html
<!-- Logout button no topbar (se não tiver) -->
<button class="logout-btn" style="position: absolute; top: 10px; right: 10px;">
  <i class="fa-solid fa-sign-out"></i> Sair
</button>

<!-- Scripts do módulo ES6 -->
<script type="module">
  // Importar cliente API
  import { api } from "./js/api.js";
  
  // Importar app com integração backend
  import { 
    doLogin, 
    STATE, 
    navigateTo, 
    PAGES,
    doLogout,
    registarVenda,
    criarReserva,
    criarProduto
  } from "./js/app-backend.js";
  
  // Importar páginas da aplicação
  import * as vendedorPages from "./js/paginas/vendedor.js";
  import * as gestorPages from "./js/paginas/gestor.js";
  import * as superPages from "./js/paginas/super.js";
  
  // Registar páginas no sistema
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
  window.doLogout = doLogout;
  window.STATE = STATE;
  window.navigateTo = navigateTo;
  window.api = api;
  window.registarVenda = registarVenda;
  window.criarReserva = criarReserva;
  window.criarProduto = criarProduto;
</script>
```

---

## 2️⃣ Usar o Backend nas Páginas

Nos seus arquivos `js/paginas/*.js`, use assim:

### Vendedor - Efetuar Venda
```javascript
import { registarVenda, STATE } from "../app-backend.js";
import { api } from "../api.js";

export function pageVender(container) {
  // ... código da UI ...
  
  async function finalizarVenda() {
    try {
      const itens = STATE.cart.map(item => ({
        produto_id: item.id,
        quantidade: item.qty,
        preco_unitario: item.preco,
        total: item.qty * item.preco
      }));
      
      const total = itens.reduce((sum, item) => sum + item.total, 0);
      
      const resultado = await registarVenda(itens, total);
      showNotification(`✓ Venda registada com sucesso! ID: ${resultado.id}`);
      
      // Limpar carrinho
      STATE.cart = [];
      renderCart();
    } catch (error) {
      showNotification(`❌ Erro: ${error.message}`);
    }
  }
}
```

### Gestor - Cadastrar Produtos
```javascript
import { criarProduto } from "../app-backend.js";
import { api } from "../api.js";

export function pageCadastrar(container) {
  // ... código da UI ...
  
  async function salvarProduto() {
    try {
      const produto = {
        nome: document.getElementById("prod-nome").value,
        categoria_id: parseInt(document.getElementById("prod-cat").value),
        preco_venda: parseFloat(document.getElementById("prod-preco").value),
        preco_custo: parseFloat(document.getElementById("prod-custo").value),
        stock_minimo: parseInt(document.getElementById("prod-min").value),
        empresaId: STATE.empresa?.id || 1
      };
      
      const resultado = await criarProduto(produto);
      showNotification(`✓ Produto criado com sucesso!`);
      
      // Recarregar lista
      // await carregarProdutos();
    } catch (error) {
      showNotification(`❌ Erro: ${error.message}`);
    }
  }
}
```

### Usando API Diretamente
```javascript
import { api } from "../api.js";

// GET
const produtos = await api.get("/produtos?empresa_id=1");

// POST
const result = await api.post("/vendas", {
  empresaId: 1,
  itens: [...],
  total: 100
});

// PUT
const updated = await api.put("/produtos/1", {
  nome: "Novo Nome",
  preco_venda: 60
});

// DELETE
await api.delete("/reservas/1");
```

---

## 3️⃣ Estrutura de Páginas

Cada página deve exportar uma função com assinatura:

```javascript
export function pageName(container) {
  // Limpar container
  container.innerHTML = "";
  
  // Criar HTML
  const html = `
    <div class="page">
      <h1>Título da Página</h1>
      <p>Conteúdo aqui</p>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Adicionar event listeners
  const btn = container.querySelector("button");
  if (btn) {
    btn.addEventListener("click", async () => {
      // Interagir com backend
    });
  }
}
```

---

## 4️⃣ Exemplo Completo: Página de Reservas

```javascript
// js/paginas/vendedor.js
import { criarReserva, STATE } from "../app-backend.js";
import { api } from "../api.js";
import { PRODUTOS } from "../data.js";

export function pageReservar(container) {
  container.innerHTML = `
    <div class="page">
      <h1>Reservar Produtos</h1>
      <div class="product-list" id="product-list"></div>
    </div>
  `;
  
  const lista = container.querySelector("#product-list");
  
  // Renderizar produtos
  PRODUTOS.forEach(produto => {
    const div = document.createElement("div");
    div.className = "product-item";
    div.innerHTML = `
      <h3>${produto.nome}</h3>
      <p>Stock: ${produto.stock}</p>
      <input type="number" min="1" max="${produto.stock}" value="1" id="qty-${produto.id}">
      <button onclick="window.reservarProduto(${produto.id})">Reservar</button>
    `;
    lista.appendChild(div);
  });
  
  // Função de reserva
  window.reservarProduto = async (produtoId) => {
    const quantidade = parseInt(document.getElementById(`qty-${produtoId}`).value);
    try {
      const resultado = await criarReserva(produtoId, quantidade);
      showNotification(`✓ Reserva criada com sucesso! ID: ${resultado.id}`);
    } catch (error) {
      showNotification(`❌ Erro: ${error.message}`);
    }
  };
}
```

---

## 5️⃣ Checklist de Integração

- [ ] Copiar scripts ES6 para `index.html`
- [ ] Verificar imports em `js/paginas/*.js`
- [ ] Testar login com credenciais demo
- [ ] Testar criação de vendas
- [ ] Testar criação de produtos
- [ ] Testar criação de reservas
- [ ] Testar dashboard

---

## 🚨 Erros Comuns

### "electronAPI is undefined"
- ✓ Certifique-se que está em Electron
- ✓ Verifique preload.js
- ✓ Reinicie a aplicação

### "API is not defined"
- ✓ Importou `api` corretamente?
- ✓ O módulo existe em `js/api.js`?

### "PAGES not found"
- ✓ Importou `PAGES` de `app-backend.js`?
- ✓ Registou todas as páginas?

---

**Próximos passos**:
1. Executar `npm start`
2. Fazer login com demo@bizcontrol.local / demo123
3. Testar funcionalidades

Bom trabalho! 🎉
