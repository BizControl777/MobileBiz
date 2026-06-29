const translations = {
  pt: {
    dashboard: "Dashboard",
    cadastrar: "Cadastrar Produtos",
    stock: "Nível de Stock",
    financas: "Finanças",
    funcionarios: "Funcionários",
    historico: "Histórico",
    estatisticas: "Estatísticas",
    reservas: "Reservas",
    definicoes: "Definições",
    preferencias: "Preferências do Sistema",
    vender: "Efectuar Venda",
    produtos_v: "Produtos",
    reservar: "Reservar Produtos",
    empresas: "Empresas",
    subscricoes: "Subscrições",
    super_stats: "Estatísticas Globais",
    logout: "Sair",
    theme: "Modo de exibição",
    language: "Idioma",
    dark: "Escuro (Padrão)",
    light: "Claro",
    apply: "Aplicar Preferências",
    success_pref: "Preferências aplicadas com sucesso!",
    save: "Guardar Alterações",
    security: "Segurança",
    password_old: "Senha Actual",
    password_new: "Nova Senha",
    update_password: "Atualizar Senha",
    company_data: "Dados da Empresa",
    company_name: "Nome da Empresa",
    address: "Endereço",
    phone: "Telefone",
    email: "Email de contacto",
    company_photo: "Foto da Empresa (Fundo)",
    select_photo: "Seleccionar Foto",
    role_super: "Super Utilizador",
    role_gestor: "Gestor",
    role_vendedor: "Vendedor"
  },
  en: {
    dashboard: "Dashboard",
    cadastrar: "Register Products",
    stock: "Stock Level",
    financas: "Finance",
    funcionarios: "Employees",
    historico: "History",
    estatisticas: "Statistics",
    reservas: "Reservations",
    definicoes: "Settings",
    preferencias: "System Preferences",
    vender: "Make Sale",
    produtos_v: "Products",
    reservar: "Reserve Products",
    empresas: "Companies",
    subscricoes: "Subscriptions",
    super_stats: "Global Stats",
    logout: "Logout",
    theme: "Display Mode",
    language: "Language",
    dark: "Dark (Default)",
    light: "Light",
    apply: "Apply Preferences",
    success_pref: "Preferences applied successfully!",
    save: "Save Changes",
    security: "Security",
    password_old: "Current Password",
    password_new: "New Password",
    update_password: "Update Password",
    company_data: "Company Data",
    company_name: "Company Name",
    address: "Address",
    phone: "Phone",
    email: "Contact Email",
    company_photo: "Company Photo (Background)",
    select_photo: "Select Photo",
    role_super: "Super User",
    role_gestor: "Manager",
    role_vendedor: "Seller"
  }
};

let currentLang = localStorage.getItem("biz_lang") || "pt";

export function t(key) {
  return translations[currentLang]?.[key] || key;
}

export function setLanguage(lang) {
  if (translations[lang]) {
    currentLang = lang;
    localStorage.setItem("biz_lang", lang);
    return true;
  }
  return false;
}

export function getLanguage() {
  return currentLang;
}
