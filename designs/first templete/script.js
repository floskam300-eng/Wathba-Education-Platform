// تبديل الثيم
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  themeToggle.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
});

// طي القائمة الجانبية
const app = document.querySelector('.app');
document.getElementById('toggleSidebar').addEventListener('click', () => {
  app.classList.toggle('collapsed');
});

// التبويبات
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
  });
});

// عناصر القائمة
document.querySelectorAll('.item:not(.locked)').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
  });
});
