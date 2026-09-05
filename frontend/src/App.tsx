import { Routes, Route } from "react-router-dom";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { Home } from "./pages/Home";
import { LessonList } from "./pages/LessonList";
import { LessonView } from "./pages/LessonView";
import { DailySession } from "./pages/DailySession";
import { GameHostPage } from "./pages/GameHostPage";
import { ProgressPage } from "./pages/ProgressPage";

export function App() {
  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lessons" element={<LessonList />} />
          <Route path="/lessons/:lessonId" element={<LessonView />} />
          <Route path="/daily" element={<DailySession />} />
          <Route path="/games/:mode" element={<GameHostPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="*" element={<p className="empty-state">Page not found.</p>} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
