@echo off
title Suivi des stages
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serveur.ps1" -Port 8080
pause
