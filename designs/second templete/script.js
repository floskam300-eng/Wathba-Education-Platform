// تبديل الثيم
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  themeToggle.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
});

// تبويبات الـ dock
document.querySelectorAll('.dock-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.dock-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
  });
});

// بطاقات الدروس
document.querySelectorAll('.card:not(.locked)').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
  });
});
