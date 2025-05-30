import { render, screen } from '@testing-library/react';
import App from './App';

test('renders webapp interface', () => {
  render(<App />);
  // Test for elements that actually exist in our app
  const chatInterface = screen.getByText(/Chat/i);
  expect(chatInterface).toBeInTheDocument();
});

test('renders live mode toggle', () => {
  render(<App />);
  // Test for the live mode functionality
  const liveToggle = screen.getByText(/Live Mode/i);
  expect(liveToggle).toBeInTheDocument();
});
