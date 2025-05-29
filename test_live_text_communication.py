#!/usr/bin/env python3
"""
Test Script for Gemini Live API - Text Communication
====================================================

This script tests the basic text communication functionality with the Gemini Live API
using the google-genai SDK. It supports both authentication methods:
1. Gemini Developer API (API key)
2. Vertex AI (Service account JSON)

Author: Assistant
Date: 2025-05
"""

import asyncio
import os
import sys
import time
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from dataclasses import dataclass, asdict
import json
from colorama import init, Fore, Back, Style

# Add backend to path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

try:
    from google import genai
    from google.genai.types import (
        Content,
        Part,
        LiveConnectConfig,
        Modality,
        SpeechConfig,
        VoiceConfig,
        PrebuiltVoiceConfig,
        HttpOptions
    )
except ImportError:
    print("Error: google-genai package not installed. Please run: pip install google-genai")
    sys.exit(1)

# Initialize colorama for cross-platform colored output
init(autoreset=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class TestResult:
    """Represents the result of a single test."""
    test_name: str
    passed: bool
    duration: float
    error: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class GeminiLiveTextTester:
    """
    Test suite for Gemini Live API text communication.
    Supports both Gemini Developer API (API key) and Vertex AI (service account) authentication.
    """
    
    def __init__(self):
        # Try to determine authentication method
        self.auth_method = self._detect_auth_method()
        self.client = self._create_client()
        self.results: list[TestResult] = []
        self.model = "gemini-2.0-flash-live-001"
        
    def _detect_auth_method(self) -> str:
        """Detect which authentication method to use."""
        api_key = os.getenv("GEMINI_API_KEY")
        vertex_project = os.getenv("GOOGLE_CLOUD_PROJECT")
        
        if api_key:
            return "api_key"
        elif vertex_project or os.path.exists("/app/gcp-key.json"):
            return "vertex_ai"
        else:
            raise ValueError("No authentication method found. Set GEMINI_API_KEY or ensure Vertex AI credentials are available.")
    
    def _create_client(self):
        """Create the appropriate client based on authentication method."""
        if self.auth_method == "api_key":
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY environment variable not set")
            return genai.Client(
                api_key=api_key,
                http_options=HttpOptions(api_version="v1beta1")
            )
        elif self.auth_method == "vertex_ai":
            # For Vertex AI, we need project and location
            project = os.getenv("GOOGLE_CLOUD_PROJECT", "your-project-id")
            location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
            
            print(f"Using Vertex AI authentication with project: {project}, location: {location}")
            
            return genai.Client(
                vertexai=True,
                project=project,
                location=location,
                http_options=HttpOptions(api_version="v1beta1")
            )
        else:
            raise ValueError(f"Unknown authentication method: {self.auth_method}")
        
    def print_header(self, text: str):
        """Print a formatted header."""
        print(f"\n{Fore.CYAN}{Style.BRIGHT}{'='*60}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}{Style.BRIGHT}{text.center(60)}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}{Style.BRIGHT}{'='*60}{Style.RESET_ALL}\n")
        
    def print_test_start(self, test_name: str):
        """Print test start message."""
        print(f"{Fore.YELLOW}Running test: {test_name}...{Style.RESET_ALL}")
        
    def print_test_result(self, result: TestResult):
        """Print test result with color coding."""
        if result.passed:
            status = f"{Fore.GREEN}✓ PASSED{Style.RESET_ALL}"
        else:
            status = f"{Fore.RED}✗ FAILED{Style.RESET_ALL}"
            
        print(f"  {status} - {result.test_name} ({result.duration:.2f}s)")
        
        if result.error:
            print(f"    {Fore.RED}Error: {result.error}{Style.RESET_ALL}")
        
        if result.details:
            print(f"    {Fore.BLUE}Details: {json.dumps(result.details, indent=2)}{Style.RESET_ALL}")
    
    async def test_basic_connection(self) -> TestResult:
        """Test 1: Establish basic connection to Live API."""
        test_name = "Basic Connection"
        self.print_test_start(test_name)
        start_time = time.time()
        
        try:
            config = LiveConnectConfig(
                response_modalities=[Modality.TEXT],
            )
            
            async with self.client.aio.live.connect(
                model=self.model,
                config=config
            ) as session:
                # Connection successful
                duration = time.time() - start_time
                return TestResult(
                    test_name=test_name,
                    passed=True,
                    duration=duration,
                    details={
                        "model": self.model, 
                        "status": "connected",
                        "auth_method": self.auth_method
                    }
                )
                
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"Connection test failed: {str(e)}")
            return TestResult(
                test_name=test_name,
                passed=False,
                duration=duration,
                error=str(e)
            )
    
    async def test_simple_text_exchange(self) -> TestResult:
        """Test 2: Send text and receive response."""
        test_name = "Simple Text Exchange"
        self.print_test_start(test_name)
        start_time = time.time()
        
        try:
            config = LiveConnectConfig(
                response_modalities=[Modality.TEXT],
            )
            
            async with self.client.aio.live.connect(
                model=self.model,
                config=config
            ) as session:
                # Send a simple message
                test_message = "Hello, Gemini! Please respond with a short greeting."
                await session.send_client_content(
                    turns=Content(role="user", parts=[Part(text=test_message)]),
                    turn_complete=True
                )
                
                # Collect response
                response_text = []
                response_received = False
                
                async for message in session.receive():
                    if message.text:
                        response_text.append(message.text)
                        response_received = True
                    
                    # Stop after receiving complete response
                    if message.server_content and message.server_content.turn_complete:
                        break
                
                full_response = "".join(response_text)
                duration = time.time() - start_time
                
                if response_received and len(full_response) > 0:
                    return TestResult(
                        test_name=test_name,
                        passed=True,
                        duration=duration,
                        details={
                            "sent": test_message,
                            "received": full_response[:100] + "..." if len(full_response) > 100 else full_response,
                            "response_length": len(full_response),
                            "auth_method": self.auth_method
                        }
                    )
                else:
                    return TestResult(
                        test_name=test_name,
                        passed=False,
                        duration=duration,
                        error="No response received"
                    )
                    
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"Text exchange test failed: {str(e)}")
            return TestResult(
                test_name=test_name,
                passed=False,
                duration=duration,
                error=str(e)
            )
    
    async def test_multi_turn_conversation(self) -> TestResult:
        """Test 3: Multi-turn conversation."""
        test_name = "Multi-turn Conversation"
        self.print_test_start(test_name)
        start_time = time.time()
        
        try:
            config = LiveConnectConfig(
                response_modalities=[Modality.TEXT],
            )
            
            async with self.client.aio.live.connect(
                model=self.model,
                config=config
            ) as session:
                conversations = [
                    "My name is TestUser. Can you remember this?",
                    "What is my name?",
                    "Thank you for remembering!"
                ]
                
                responses = []
                
                for message in conversations:
                    # Send message
                    await session.send_client_content(
                        turns=Content(role="user", parts=[Part(text=message)]),
                        turn_complete=True
                    )
                    
                    # Collect response
                    response_text = []
                    async for msg in session.receive():
                        if msg.text:
                            response_text.append(msg.text)
                        
                        if msg.server_content and msg.server_content.turn_complete:
                            break
                    
                    full_response = "".join(response_text)
                    responses.append({
                        "user": message,
                        "assistant": full_response[:100] + "..." if len(full_response) > 100 else full_response
                    })
                
                duration = time.time() - start_time
                
                # Check if the model remembered the name in the second response
                name_remembered = "TestUser" in responses[1]["assistant"]
                
                return TestResult(
                    test_name=test_name,
                    passed=name_remembered,
                    duration=duration,
                    details={
                        "turns": len(conversations),
                        "name_remembered": name_remembered,
                        "conversation_sample": responses[1],  # Show the name query response
                        "auth_method": self.auth_method
                    }
                )
                
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"Multi-turn conversation test failed: {str(e)}")
            return TestResult(
                test_name=test_name,
                passed=False,
                duration=duration,
                error=str(e)
            )
    
    async def test_system_instruction(self) -> TestResult:
        """Test 4: System instruction compliance."""
        test_name = "System Instruction"
        self.print_test_start(test_name)
        start_time = time.time()
        
        try:
            system_instruction = Content(
                parts=[Part(text="You are a pirate. Always speak like a pirate with 'arr' and 'matey' in your responses.")]
            )
            
            config = LiveConnectConfig(
                response_modalities=[Modality.TEXT],
                system_instruction=system_instruction
            )
            
            async with self.client.aio.live.connect(
                model=self.model,
                config=config
            ) as session:
                # Send a message
                await session.send_client_content(
                    turns=Content(role="user", parts=[Part(text="Tell me about the weather today")]),
                    turn_complete=True
                )
                
                # Collect response
                response_text = []
                async for message in session.receive():
                    if message.text:
                        response_text.append(message.text)
                    
                    if message.server_content and message.server_content.turn_complete:
                        break
                
                full_response = "".join(response_text).lower()
                duration = time.time() - start_time
                
                # Check for pirate speak
                pirate_words = ["arr", "matey", "ahoy", "ye", "aye"]
                has_pirate_speak = any(word in full_response for word in pirate_words)
                
                return TestResult(
                    test_name=test_name,
                    passed=has_pirate_speak,
                    duration=duration,
                    details={
                        "system_instruction": "Speak like a pirate",
                        "pirate_speak_detected": has_pirate_speak,
                        "response_sample": full_response[:150] + "..." if len(full_response) > 150 else full_response,
                        "auth_method": self.auth_method
                    }
                )
                
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"System instruction test failed: {str(e)}")
            return TestResult(
                test_name=test_name,
                passed=False,
                duration=duration,
                error=str(e)
            )
    
    async def test_streaming_response(self) -> TestResult:
        """Test 5: Streaming response chunks."""
        test_name = "Streaming Response"
        self.print_test_start(test_name)
        start_time = time.time()
        
        try:
            config = LiveConnectConfig(
                response_modalities=[Modality.TEXT],
            )
            
            async with self.client.aio.live.connect(
                model=self.model,
                config=config
            ) as session:
                # Send a message that should generate a longer response
                await session.send_client_content(
                    turns=Content(
                        role="user", 
                        parts=[Part(text="Count from 1 to 10 slowly, with a brief pause between each number.")]
                    ),
                    turn_complete=True
                )
                
                # Track streaming chunks
                chunks = []
                chunk_times = []
                
                async for message in session.receive():
                    if message.text:
                        chunks.append(message.text)
                        chunk_times.append(time.time())
                    
                    if message.server_content and message.server_content.turn_complete:
                        break
                
                duration = time.time() - start_time
                
                # Calculate streaming metrics
                streaming_detected = len(chunks) > 1
                if len(chunk_times) > 1:
                    avg_chunk_interval = sum(
                        chunk_times[i] - chunk_times[i-1] 
                        for i in range(1, len(chunk_times))
                    ) / (len(chunk_times) - 1)
                else:
                    avg_chunk_interval = 0
                
                return TestResult(
                    test_name=test_name,
                    passed=streaming_detected,
                    duration=duration,
                    details={
                        "chunks_received": len(chunks),
                        "streaming_detected": streaming_detected,
                        "avg_chunk_interval_ms": round(avg_chunk_interval * 1000, 2),
                        "total_response_length": sum(len(chunk) for chunk in chunks),
                        "auth_method": self.auth_method
                    }
                )
                
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"Streaming response test failed: {str(e)}")
            return TestResult(
                test_name=test_name,
                passed=False,
                duration=duration,
                error=str(e)
            )
    
    async def test_error_handling(self) -> TestResult:
        """Test 6: Error handling with invalid input."""
        test_name = "Error Handling"
        self.print_test_start(test_name)
        start_time = time.time()
        
        try:
            # Test with an invalid model name
            invalid_model = "gemini-invalid-model"
            config = LiveConnectConfig(
                response_modalities=[Modality.TEXT],
            )
            
            error_caught = False
            error_message = None
            
            try:
                async with self.client.aio.live.connect(
                    model=invalid_model,
                    config=config
                ) as session:
                    pass
            except Exception as e:
                error_caught = True
                error_message = str(e)
            
            duration = time.time() - start_time
            
            return TestResult(
                test_name=test_name,
                passed=error_caught,
                duration=duration,
                details={
                    "error_caught": error_caught,
                    "error_message": error_message,
                    "test_type": "invalid_model",
                    "auth_method": self.auth_method
                }
            )
                
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"Error handling test failed unexpectedly: {str(e)}")
            return TestResult(
                test_name=test_name,
                passed=False,
                duration=duration,
                error=str(e)
            )
    
    async def run_all_tests(self):
        """Run all tests and generate report."""
        self.print_header("Gemini Live API Text Communication Test Suite")
        
        print(f"{Fore.BLUE}Configuration:{Style.RESET_ALL}")
        print(f"  Model: {self.model}")
        print(f"  Authentication: {self.auth_method.replace('_', ' ').title()}")
        if self.auth_method == "vertex_ai":
            print(f"  Project: {os.getenv('GOOGLE_CLOUD_PROJECT', 'default')}")
            print(f"  Location: {os.getenv('GOOGLE_CLOUD_LOCATION', 'us-central1')}")
        print(f"  Timestamp: {datetime.now().isoformat()}")
        
        # Define all tests
        tests = [
            self.test_basic_connection,
            self.test_simple_text_exchange,
            self.test_multi_turn_conversation,
            self.test_system_instruction,
            self.test_streaming_response,
            self.test_error_handling
        ]
        
        # Run tests
        print(f"\n{Fore.BLUE}Running {len(tests)} tests...{Style.RESET_ALL}\n")
        
        for test_func in tests:
            try:
                result = await test_func()
                self.results.append(result)
                self.print_test_result(result)
            except Exception as e:
                logger.error(f"Unexpected error in test {test_func.__name__}: {str(e)}")
                self.results.append(TestResult(
                    test_name=test_func.__name__,
                    passed=False,
                    duration=0,
                    error=f"Unexpected error: {str(e)}"
                ))
        
        # Generate summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary."""
        self.print_header("Test Summary")
        
        total_tests = len(self.results)
        passed_tests = sum(1 for r in self.results if r.passed)
        failed_tests = total_tests - passed_tests
        total_duration = sum(r.duration for r in self.results)
        
        # Summary stats
        print(f"{Fore.BLUE}Total Tests:{Style.RESET_ALL} {total_tests}")
        print(f"{Fore.GREEN}Passed:{Style.RESET_ALL} {passed_tests}")
        print(f"{Fore.RED}Failed:{Style.RESET_ALL} {failed_tests}")
        print(f"{Fore.BLUE}Total Duration:{Style.RESET_ALL} {total_duration:.2f}s")
        print(f"{Fore.BLUE}Authentication:{Style.RESET_ALL} {self.auth_method.replace('_', ' ').title()}")
        
        # Success rate
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        if success_rate == 100:
            rate_color = Fore.GREEN
        elif success_rate >= 80:
            rate_color = Fore.YELLOW
        else:
            rate_color = Fore.RED
        
        print(f"{Fore.BLUE}Success Rate:{Style.RESET_ALL} {rate_color}{success_rate:.1f}%{Style.RESET_ALL}")
        
        # Failed tests details
        if failed_tests > 0:
            print(f"\n{Fore.RED}Failed Tests:{Style.RESET_ALL}")
            for result in self.results:
                if not result.passed:
                    print(f"  - {result.test_name}: {result.error}")
        
        # Save results to file
        self.save_results()
        
        # Overall status
        print(f"\n{Fore.CYAN}{'='*60}{Style.RESET_ALL}")
        if success_rate == 100:
            print(f"{Fore.GREEN}{Style.BRIGHT}All tests passed! ✓{Style.RESET_ALL}")
            print(f"{Fore.GREEN}The Gemini Live API text communication is working correctly.{Style.RESET_ALL}")
        else:
            print(f"{Fore.YELLOW}{Style.BRIGHT}Some tests failed.{Style.RESET_ALL}")
            print(f"{Fore.YELLOW}Please review the failed tests above.{Style.RESET_ALL}")
        print(f"{Fore.CYAN}{'='*60}{Style.RESET_ALL}")
    
    def save_results(self):
        """Save test results to a JSON file."""
        # Create test_results directory if it doesn't exist
        os.makedirs('test_results', exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"test_results/gemini_live_test_results_{timestamp}.json"
        
        results_data = {
            "timestamp": datetime.now().isoformat(),
            "model": self.model,
            "auth_method": self.auth_method,
            "summary": {
                "total_tests": len(self.results),
                "passed": sum(1 for r in self.results if r.passed),
                "failed": sum(1 for r in self.results if not r.passed),
                "total_duration": sum(r.duration for r in self.results)
            },
            "results": [asdict(r) for r in self.results]
        }
        
        with open(filename, 'w') as f:
            json.dump(results_data, f, indent=2)
        
        print(f"\n{Fore.BLUE}Results saved to:{Style.RESET_ALL} {filename}")


async def main():
    """Main entry point."""
    try:
        tester = GeminiLiveTextTester()
        await tester.run_all_tests()
    except ValueError as e:
        print(f"{Fore.RED}Configuration Error: {str(e)}{Style.RESET_ALL}")
        print("\nAuthentication Options:")
        print("1. Gemini Developer API: Set GEMINI_API_KEY environment variable")
        print("2. Vertex AI: Ensure GOOGLE_CLOUD_PROJECT is set and service account credentials are available")
        sys.exit(1)
    except Exception as e:
        print(f"{Fore.RED}Unexpected Error: {str(e)}{Style.RESET_ALL}")
        logger.exception("Unexpected error in main")
        sys.exit(1)


if __name__ == "__main__":
    # Run the async main function
    asyncio.run(main()) 