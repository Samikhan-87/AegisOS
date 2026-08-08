import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatShell } from './components/ChatShell';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ChatShell />
    </QueryClientProvider>
  );
}

export default App;
