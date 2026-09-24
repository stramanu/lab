# lab-site Specification

## Purpose
Provides the lab: a home page listing the experiments, a URL layout with one folder per experiment, and navigation shared by every page.

## Requirements

### Requirement: Lab home
The site root SHALL be a lab home page that presents the lab and lists every published experiment with its question, its environments, its status and a one-line result taken from the published studies, and SHALL describe how experiments are run. It MUST NOT redirect to a single experiment.

#### Scenario: Root is the lab
- **WHEN** a visitor opens `/`
- **THEN** the lab home is shown, with a link to every experiment

### Requirement: URL layout
The System One page SHALL be served at `/systemone/` and the handwriting page at `/handwriting/`, and shared data at `/data/`. The former `/systemone/handwriting/` SHALL redirect to `/handwriting/`.

#### Scenario: Old handwriting link
- **WHEN** a visitor opens `/systemone/handwriting/`
- **THEN** they are redirected to `/handwriting/`

### Requirement: Shared navigation
Every page SHALL show the same navigation bar, with a link home, a link to each experiment and the theme toggle, and SHALL mark the current page.

#### Scenario: Current page marked
- **WHEN** a visitor is on the handwriting page
- **THEN** the handwriting link in the navigation is marked as the current page
