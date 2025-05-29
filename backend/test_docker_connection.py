#!/usr/bin/env python3
"""
Simple test to verify Docker setup is working correctly
"""

import os
import sys
from colorama import init, Fore, Style

# Initialize colorama
init(autoreset=True)

print(f"{Fore.CYAN}{'='*60}{Style.RESET_ALL}")
print(f"{Fore.CYAN}Docker Environment Test{Style.RESET_ALL}")
print(f"{Fore.CYAN}{'='*60}{Style.RESET_ALL}\n")

# Check environment
print(f"{Fore.YELLOW}1. Environment Variables:{Style.RESET_ALL}")
api_key = os.getenv("GEMINI_API_KEY", "NOT SET")
if api_key == "NOT SET":
    print(f"   {Fore.RED}❌ GEMINI_API_KEY: Not found in environment{Style.RESET_ALL}")
elif api_key == "your-gemini-api-key-here":
    print(f"   {Fore.YELLOW}⚠️  GEMINI_API_KEY: Still using placeholder value{Style.RESET_ALL}")
    print(f"   {Fore.YELLOW}   Please update .secrets/.env with your actual API key{Style.RESET_ALL}")
else:
    print(f"   {Fore.GREEN}✅ GEMINI_API_KEY: {api_key[:20]}...{Style.RESET_ALL}")

gcp_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "NOT SET")
if gcp_creds != "NOT SET":
    print(f"   {Fore.GREEN}✅ GOOGLE_APPLICATION_CREDENTIALS: {gcp_creds}{Style.RESET_ALL}")
else:
    print(f"   {Fore.RED}❌ GOOGLE_APPLICATION_CREDENTIALS: Not set{Style.RESET_ALL}")

# Check imports
print(f"\n{Fore.YELLOW}2. Python Package Imports:{Style.RESET_ALL}")
try:
    import google.genai
    print(f"   {Fore.GREEN}✅ google.genai: Successfully imported{Style.RESET_ALL}")
except ImportError as e:
    print(f"   {Fore.RED}❌ google.genai: Import failed - {e}{Style.RESET_ALL}")

try:
    import colorama
    print(f"   {Fore.GREEN}✅ colorama: Successfully imported{Style.RESET_ALL}")
except ImportError as e:
    print(f"   {Fore.RED}❌ colorama: Import failed - {e}{Style.RESET_ALL}")

# Check file system
print(f"\n{Fore.YELLOW}3. File System:{Style.RESET_ALL}")
print(f"   Working directory: {os.getcwd()}")
print(f"   Test script exists: {os.path.exists('test_live_text_communication.py')}")

if gcp_creds != "NOT SET" and os.path.exists(gcp_creds):
    print(f"   {Fore.GREEN}✅ GCP key file exists at: {gcp_creds}{Style.RESET_ALL}")
else:
    print(f"   {Fore.RED}❌ GCP key file not found{Style.RESET_ALL}")

# Summary
print(f"\n{Fore.CYAN}{'='*60}{Style.RESET_ALL}")
if api_key != "NOT SET" and api_key != "your-gemini-api-key-here":
    print(f"{Fore.GREEN}✅ Environment is properly configured!{Style.RESET_ALL}")
    print(f"{Fore.GREEN}   You can run the actual tests now.{Style.RESET_ALL}")
else:
    print(f"{Fore.YELLOW}⚠️  Environment needs configuration{Style.RESET_ALL}")
    print(f"{Fore.YELLOW}   Please update .secrets/.env with your actual API key{Style.RESET_ALL}")
print(f"{Fore.CYAN}{'='*60}{Style.RESET_ALL}")

sys.exit(0) 