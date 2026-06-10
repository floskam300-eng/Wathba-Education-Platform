import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LiveStreamProvider } from './context/LiveStreamContext';
import { TeacherWrapper, TeacherNotFound } from './context/TeacherContext';
import { getTenantSlug } from './lib/tenant';
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
import TeacherActivityLog from './pages/teacher/ActivityLog';
import CourseContent from './pages/teacher/CourseContent';
import ExamQuestions from './pages/teacher/ExamQuestions';
import TeacherSettings from './pages/teacher/Settings';
import TeacherRecitations from './pages/teacher/Recitations';
import TeacherArchive from './pages/teacher/Archive';
import StudentRecitations from './pages/student/Recitations';
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
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsAndConditions from './pages/TermsAndConditions';

// ─── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || '';
      const stack = this.state.info?.componentStack || '';
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center" dir="rtl">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full text-right">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2 text-center">حدث خطأ غير متوقع</h2>
            {msg && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-left overflow-auto max-h-32">
                <p className="text-red-700 text-xs font-mono break-all">{msg}</p>
              </div>
            )}
            {stack && (
              <details className="mb-4">
                <summary className="text-xs text-gray-500 cursor-pointer mb-1">تفاصيل الخطأ</summary>
                <pre className="bg-gray-100 rounded p-2 text-[10px] text-gray-600 overflow-auto max-h-40 text-left">{stack}</pre>
              </details>
            )}
            <button onClick={() => { this.setState({ hasError: false, error: null, info: null }); }}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-semibold mx-auto transition-colors">
              <RefreshCw className="w-4 h-4" /> محاولة مرة أخرى
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Assistant Permission Route ──────────────────────────────────────────────
const AssistantPermissionRoute = ({ children, permission, anyOf }) => {
  const { user } = useAuth();
  if (user?.role === 'assistant') {
    const hasPermission = anyOf
      ? anyOf.some(p => user[p])
      : (permission ? user[permission] : true);
    if (!hasPermission) return <Navigate to="/assistant" replace />;
  }
  return children;
};

// ─── Protected Route ─────────────────────────────────────────────────────────
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// ─── Tenant Routes (subdomain present) ───────────────────────────────────────
// TeacherWrapper is used as a layout Route element — its internal <Outlet /> renders
// the matched child route. This is the correct React Router v6 "layout route" pattern.
const TenantRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Layout route: TeacherWrapper loads teacher context, shows spinner/error, then <Outlet /> */}
      <Route element={<TeacherWrapper />}>

        <Route index element={<LandingPage />} />

        <Route path="login"
          element={user && user.teacher_slug ? <Navigate to={`/${user.role}`} replace /> : <Login />} />

        <Route path="parent-portal" element={<ParentPortal />} />

        {/* ── Teacher dashboard ─────────────────────────────────────────────── */}
        <Route path="teacher" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <ErrorBoundary><TeacherLayout /></ErrorBoundary>
          </ProtectedRoute>
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
          <Route path="activity-log" element={<TeacherActivityLog />} />
          <Route path="courses/:courseId/content" element={<CourseContent />} />
          <Route path="exams/:examId/questions" element={<ExamQuestions />} />
          <Route path="settings" element={<TeacherSettings />} />
          <Route path="recitations" element={<TeacherRecitations />} />
          <Route path="archive" element={<TeacherArchive />} />
        </Route>

        {/* ── Assistant dashboard ────────────────────────────────────────────── */}
        <Route path="assistant" element={
          <ProtectedRoute allowedRoles={['assistant']}>
            <ErrorBoundary><AssistantLayout /></ErrorBoundary>
          </ProtectedRoute>
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
          <Route path="courses/:courseId/content" element={
            <AssistantPermissionRoute permission="can_manage_courses"><CourseContent /></AssistantPermissionRoute>
          } />
          <Route path="exams/:examId/questions" element={
            <AssistantPermissionRoute permission="can_manage_exams"><ExamQuestions /></AssistantPermissionRoute>
          } />
          <Route path="recitations" element={
            <AssistantPermissionRoute permission="can_manage_recitations"><TeacherRecitations /></AssistantPermissionRoute>
          } />
          <Route path="archive" element={
            <AssistantPermissionRoute anyOf={['can_view_analytics', 'can_manage_exams', 'can_manage_recitations']}>
              <TeacherArchive />
            </AssistantPermissionRoute>
          } />
        </Route>

        {/* ── Student dashboard ─────────────────────────────────────────────── */}
        <Route path="student" element={
          <ProtectedRoute allowedRoles={['student']}>
            <ErrorBoundary><StudentLayout /></ErrorBoundary>
          </ProtectedRoute>
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
          <Route path="recitations" element={<StudentRecitations />} />
        </Route>

        {/* Stickman run — fullscreen game, outside StudentLayout intentionally */}
        <Route path="student/events/stickman-run" element={
          <ProtectedRoute allowedRoles={['student']}><StickmanRunPage /></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />

      </Route>
    </Routes>
  );
};

// ─── Main Domain Routes (no subdomain — SaaS landing) ────────────────────────
const MainDomainRoutes = () => (
  <Routes>
    <Route path="/" element={<PlatformHome />} />
    <Route path="/privacy" element={<PrivacyPolicy />} />
    <Route path="/terms" element={<TermsAndConditions />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

// ─── Root Router ──────────────────────────────────────────────────────────────
const AppRoutes = () => {
  const tenantSlug = getTenantSlug();
  // No subdomain / no localStorage slug → show SaaS landing
  if (!tenantSlug) return <MainDomainRoutes />;
  // Subdomain or dev localStorage slug → show tenant app
  return <TenantRoutes />;
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
