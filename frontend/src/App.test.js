import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

test('renders webapp interface', () => {
  render(<App />);
  // Test for elements that actually exist in our app
  const chatInterface = screen.getByText(/Chat/i);
  expect(chatInterface).toBeInTheDocument();
});

test('renders live mode toggle when provider is set to Gemini', async () => {
  render(<App />);

  // Locate the provider select element in the sidebar
  const providerSelect = await screen.findByLabelText(/Provider/i);

  // Switch provider to Gemini so the Start/Stop Live button becomes visible
  fireEvent.change(providerSelect, { target: { value: 'gemini' } });

  // Wait for the UI to re-render with the live button
  await waitFor(() => {
    expect(screen.getByText(/Start Live/i)).toBeInTheDocument();
  });
});
