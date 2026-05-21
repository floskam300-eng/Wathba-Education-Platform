import React from 'react';
import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LiveStreamProvider } from './context/LiveStreamContext';
import { TeacherWrapper, TeacherNotFound } from './context/TeacherContext';
import Login from './pages/Login';
import PlatformHome from './pages/PlatformHome';
import LandingPage from './pages/LandingPage';
import TeacherLayout from './layouts/TeacherLayout';
import AssistantLayout from './layouts/AssistantLayout';
import StudentLayout from './layouts/StudentLayout';
import TeacherDashboard from './pages/teacher/Dashboard';
import TeacherStudents from './pages/teacher/Students';
import TeacherCourses from './pages/teacher/Courses';
import TeacherExams from './pages/teacher/Exams';
import TeacherAssistants from './pages/teacher/Assistants';
import TeacherAnalytics from './pages/teacher/Analytics';
import TeacherPayments from './pages/teacher/Payments';
import TeacherLeaderboard from './pages/teacher/Leaderboard';
import TeacherNotifications from './pages/teacher/Notifications';
import TeacherBackup from './pages/teacher/Backup';
import TeacherAttendance from './pages/teacher/Attendance';
import TeacherRequests from './pages/teacher/Requests';
import WrongQuestionsPage from './pages/teacher/WrongQuestions';
import QuestionBanks from './pages/teacher/QuestionBanks';
import TeacherLiveStream from './pages/teacher/LiveStream';
import StudentLiveStream from './pages/student/LiveStream';
import AssistantDashboard from './pages/assistant/Dashboard';
import AssistantStudents from './pages/assistant/Students';
import AssistantExams from './pages/teacher/Exams';
import AssistantAnalytics from './pages/assistant/Analytics';
import AssistantCourses from './pages/assistant/Courses';
import AssistantPayments from './pages/assistant/Payments';
import StudentDashboard from './pages/student/Dashboard';
import StudentCourses from './pages/student/Courses';
import StudentCourseView from './pages/student/CourseView';
import StudentExams from './pages/student/Exams';
import StudentLeaderboard from './pages/student/Leaderboard';
import StudentMyStats from './pages/student/MyStats';
import StudentNotifications from './pages/student/Notifications';
import StudentEvents from './pages/student/Events';
import StickmanRunPage from './pages/student/games/StickmanRunPage';
import ExamReviewPage from './pages/ExamReviewPage';
import ParentPortal from './pages/ParentPortal';

// ─── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center" dir="rtl">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">حدث خطأ غير متوقع</h2>
            <p className="text-gray-500 text-sm mb-6">يرجى إعادة تحميل الصفحة.</p>
            <button onClick={() => window.location.reload()}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-semibold mx-auto transition-colors">
              <RefreshCw className="w-4 h-4" /> إعادة تحميل
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Assistant Permission Route ─────────────────────────────────────────────────
const AssistantPermissionRoute = ({ children, permission, anyOf }) => {
  const { user } = useAuth();
  const { teacherSlug } = useParams();
  if (user?.role === 'assistant') {
    const hasPermission = anyOf
      ? anyOf.some(p => user[p])
      : (permission ? user[permission] : true);
    if (!hasPermission) return <Navigate to={`/${teacherSlug}/assistant`} replace />;
  }
  return children;
};

// ─── Protected Route ────────────────────────────────────────────────────────────
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  const { teacherSlug } = useParams();

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );

  if (!user) return <Navigate to={`/${teacherSlug}/login`} replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={`/${teacherSlug}/login`} replace />;
  }

  // Security: ensure user belongs to this teacher's portal
  if (user.teacher_slug && teacherSlug && user.teacher_slug !== teacherSlug) {
    return <Navigate to={`/${teacherSlug}/login`} replace />;
  }

  return children;
};

// ─── Legacy Redirects (inner page navigate() calls use /teacher/... paths) ─────
function LegacyRoleRedirect({ role }) {
  const params = useParams();
  const slug = localStorage.getItem('wathba_teacher_slug');
  const rest = params['*'] || '';
  if (!slug) return <Navigate to="/" replace />;
  return <Navigate to={`/${slug}/${role}${rest ? `/${rest}` : ''}`} replace />;
}

function LegacyLoginRedirect() {
  const slug = localStorage.getItem('wathba_teacher_slug');
  if (!slug) return <Navigate to="/" replace />;
  return <Navigate to={`/${slug}/login`} replace />;
}

function LegacyParentPortalRedirect() {
  const slug = localStorage.getItem('wathba_teacher_slug');
  if (!slug) return <Navigate to="/" replace />;
  return <Navigate to={`/${slug}/parent-portal`} replace />;
}

// ─── Routes ─────────────────────────────────────────────────────────────────────
const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      {/* ── Legacy shortcuts (inner pages use hardcoded /role/... paths) ── */}
      <Route path="/teacher/*" element={<LegacyRoleRedirect role="teacher" />} />
      <Route path="/assistant/*" element={<LegacyRoleRedirect role="assistant" />} />
      <Route path="/student/*" element={<LegacyRoleRedirect role="student" />} />
      <Route path="/login" element={<LegacyLoginRedirect />} />
      <Route path="/parent-portal" element={<LegacyParentPortalRedirect />} />

      {/* ── Slug-based multi-tenant routes ── */}
      <Route path="/:teacherSlug" element={<TeacherWrapper />}>
        <Route index element={<LandingPage />} />

        <Route path="login"
          element={user && user.teacher_slug ? <Navigate to={`/${user.teacher_slug}/${user.role}`} replace /> : <Login />} />

        <Route path="parent-portal" element={<ParentPortal />} />

        {/* Teacher dashboard */}
        <Route path="teacher" element={
          <ProtectedRoute allowedRoles={['teacher']}><TeacherLayout /></ProtectedRoute>
        }>
          <Route index element={<TeacherDashboard />} />
          <Route path="students" element={<TeacherStudents />} />
          <Route path="courses" element={<TeacherCourses />} />
          <Route path="exams" element={<TeacherExams />} />
          <Route path="assistants" element={<TeacherAssistants />} />
          <Route path="analytics" element={<TeacherAnalytics />} />
          <Route path="payments" element={<TeacherPayments />} />
          <Route path="leaderboard" element={<TeacherLeaderboard />} />
          <Route path="notifications" element={<TeacherNotifications />} />
          <Route path="backup" element={<TeacherBackup />} />
          <Route path="attendance" element={<TeacherAttendance />} />
          <Route path="requests" element={<TeacherRequests />} />
          <Route path="exam-review/:resultId" element={<ExamReviewPage />} />
          <Route path="wrong-questions" element={<WrongQuestionsPage />} />
          <Route path="question-banks" element={<QuestionBanks />} />
          <Route path="livestream" element={<TeacherLiveStream />} />
        </Route>

        {/* Assistant dashboard */}
        <Route path="assistant" element={
          <ProtectedRoute allowedRoles={['assistant']}><AssistantLayout /></ProtectedRoute>
        }>
          <Route index element={<AssistantDashboard />} />
          <Route path="students" element={<AssistantStudents />} />
          <Route path="exams" element={
            <AssistantPermissionRoute permission="can_manage_exams"><AssistantExams /></AssistantPermissionRoute>
          } />
          <Route path="question-banks" element={
            <AssistantPermissionRoute permission="can_manage_exams"><QuestionBanks /></AssistantPermissionRoute>
          } />
          <Route path="courses" element={
            <AssistantPermissionRoute permission="can_manage_courses"><AssistantCourses /></AssistantPermissionRoute>
          } />
          <Route path="payments" element={
            <AssistantPermissionRoute permission="can_manage_payments"><AssistantPayments /></AssistantPermissionRoute>
          } />
          <Route path="analytics" element={
            <AssistantPermissionRoute permission="can_view_analytics"><AssistantAnalytics /></AssistantPermissionRoute>
          } />
          <Route path="notifications" element={
            <AssistantPermissionRoute permission="can_send_notifications"><TeacherNotifications /></AssistantPermissionRoute>
          } />
          <Route path="requests" element={
            <AssistantPermissionRoute anyOf={['can_manage_exams', 'can_manage_courses']}><TeacherRequests /></AssistantPermissionRoute>
          } />
          <Route path="exam-review/:resultId" element={<ExamReviewPage />} />
        </Route>

        {/* Student dashboard */}
        <Route path="student" element={
          <ProtectedRoute allowedRoles={['student']}><StudentLayout /></ProtectedRoute>
        }>
          <Route index element={<StudentDashboard />} />
          <Route path="courses" element={<StudentCourses />} />
          <Route path="courses/:courseId" element={<StudentCourseView />} />
          <Route path="exams" element={<StudentExams />} />
          <Route path="stats" element={<StudentMyStats />} />
          <Route path="notifications" element={<StudentNotifications />} />
          <Route path="leaderboard" element={<StudentLeaderboard />} />
          <Route path="exam-review/:resultId" element={<ExamReviewPage />} />
          <Route path="live" element={<StudentLiveStream />} />
          <Route path="events" element={<StudentEvents />} />
        </Route>

        {/* Stickman run - outside StudentLayout */}
        <Route path="student/events/stickman-run" element={
          <ProtectedRoute allowedRoles={['student']}><StickmanRunPage /></ProtectedRoute>
        } />
      </Route>

      {/* Root — SaaS marketing page */}
      <Route path="/" element={<PlatformHome />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <LiveStreamProvider>
            <AppRoutes />
          </LiveStreamProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
