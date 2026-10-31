# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Node.js + TypeScript for the authoritative server and real socket client; React + Vite + TypeScript for the local visual interface. Inferred from the supplied implementation brief.

## Users

University students playing in teams during a Computer Networks class activity, and the instructor who starts and observes a match.

## Product Purpose

Trilha Redes turns revision of Hardware, Software and Networks content into a synchronized, turn-based board game. A successful match is fair, traceable, and demonstrably uses TCP and UDP networking.

## Positioning

The browser interface is deliberately separated from the real Node network client: the client communicates with the authoritative game server via TCP and UDP, then serves state to its local UI.

## Operating Context

At least three teams run a client process on a LAN or localhost. Teams register, wait for the server to start, choose a reusable movement token, and answer a timed multiple-choice question.

## Capabilities and Constraints

- Server alone owns official game state and validates turns and timers.
- TCP uses UTF-8 JSON Lines; UDP is used for non-authoritative turn and event notices.
- The board begins with 30 configurable spaces; questions load from a local JSON file.
- A local HTTP + Server-Sent Events bridge connects React to the socket client.

## Brand Commitments

Name: Trilha Redes. The requested visual identity is cyberpunk.

## Evidence on Hand

The technical brief supplied for this project and the local question JSON authored in the repository. No external assets or claims are required.

## Product Principles

- The server is the single source of truth.
- Every protocol requirement should be observable in logs and Wireshark.
- Play decisions must be understandable under time pressure.
- The UI decorates the game without hiding networking concepts.
