import AppRouter from "./routes/AppRouter";
import ErrorBoundary from "./components/common/ErrorBoundary";

function App() {
  return (
    <ErrorBoundary title="Error inesperado en SIGAE">
      <AppRouter />
    </ErrorBoundary>
  );
}

export default App;
