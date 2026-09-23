# micro-policy-net Specification

## Purpose
Provides the System One micro-network, written from scratch without ML libraries, which learns from the teacher's soft labels, exposes honest and calibrated probabilities and exports to a few KB.

## Requirements

### Requirement: Configurable architecture
The network SHALL be an MLP with input size, two ReLU hidden layers of configurable width and one logit per action. Weight initialization MUST be deterministic given a seed.

#### Scenario: Parameter count
- **WHEN** a Snake network is created with the default configuration
- **THEN** the reported parameter count is between 5,000 and 40,000

### Requirement: Masked policy
The output SHALL apply a mask that excludes illegal actions before the softmax, so that the probabilities are the network's actual policy.

#### Scenario: Masked illegal action
- **WHEN** an action is marked as illegal
- **THEN** its output probability is exactly 0

### Requirement: Soft-label training
The network SHALL train with cross-entropy on soft labels obtained by applying a softmax with configurable temperature τ to the teacher's scores, with the Adam optimizer and mini-batches.

#### Scenario: Loss decreases
- **WHEN** it is trained for a few epochs on a fixed dataset of labeled states
- **THEN** the final training loss is strictly lower than the initial one

#### Scenario: Correct gradients
- **WHEN** analytic gradients are compared with finite differences on a small network
- **THEN** the maximum relative error is below 1e-4 (double-precision computation)

### Requirement: Calibration with temperature scaling
The network SHALL support a calibration temperature estimated on a separate validation set, and SHALL compute the expected calibration error (ECE) and reliability diagram data per confidence bin.

#### Scenario: Calibration does not worsen NLL
- **WHEN** the temperature is estimated on a validation set
- **THEN** the negative log-likelihood on the validation set with the estimated temperature is less than or equal to the one with temperature 1

### Requirement: Weight serialization
Weights, configuration and calibration temperature SHALL be exportable and re-importable in a self-contained JSON format, producing identical decisions after reloading.

#### Scenario: Round trip
- **WHEN** a trained network is exported and re-imported
- **THEN** the output probabilities on a set of states match the original ones within 1e-6

### Requirement: Activation trace
The network SHALL be able to return, for an input, the activations of every layer of its forward pass (input, both hidden layers after ReLU, and output logits), consistent with the probabilities it returns for the same input.

#### Scenario: Trace matches the policy
- **WHEN** the trace and the masked policy are computed for the same input
- **THEN** the softmax of the traced logits equals the policy probabilities within 1e-6
