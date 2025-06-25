import { render, screen } from '@testing-library/react';
import MessageList from '../MessageList';
import React from 'react';

function renderWithState(messages, currentBotResponse) {
  return render(
    <MessageList
      messages={messages}
      isLoadingMessages={false}
      isUploadingMedia={false}
      currentBotResponse={currentBotResponse}
      onPlaybackFromPlaceholder={() => {}}
    />
  );
}

describe('MessageList streaming rendering', () => {
  it('shows token-by-token text as currentBotResponse updates', () => {
    const userMessages = [
      {
        id: '1',
        text: 'Hello',
        sender: 'user',
        timestamp: new Date().toISOString(),
        chat_session_id: 1,
      },
    ];

    const botResponse = {
      id: 'bot-1',
      text: 'A',
      sender: 'bot',
      timestamp: new Date().toISOString(),
      chat_session_id: 1,
      status: 'streaming',
    };

    const { rerender } = renderWithState(userMessages, botResponse);

    // Initial token should be present
    expect(screen.getByText('A')).toBeInTheDocument();

    // Simulate subsequent token arrival
    const botResponse2 = { ...botResponse, text: 'AB', status: 'streaming' };
    rerender(
      <MessageList
        messages={userMessages}
        isLoadingMessages={false}
        isUploadingMedia={false}
        currentBotResponse={botResponse2}
        onPlaybackFromPlaceholder={() => {}}
      />
    );

    expect(screen.getByText('AB')).toBeInTheDocument();
  });
});