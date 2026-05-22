/**
 * Pure-TS deployment planner.
 *
 * Owns the schedule math and config-shape construction that previously lived
 * inline inside `DeployStep4Deploy.svelte`. No Svelte imports —
 * everything in here is unit-testable.
 *
 * Stellar-bound concerns (Freighter signing, TX submission, receipt waiting)
 * stay in the app service. The component supplies parsed token amounts and gets back a
 * fully-validated `FactoryDeployConfig` plus the `OnChainVestingContract`
 * shape used for optimistic cache updates.
 *
 * @module domain/deployPlanner
 */

import type { DurationUnit, HexString, StellarAddress, StellarContractId } from '../types';
import {
    durationToSeconds,
    cliffDateToSeconds,
    unitToPeriodSeconds,
    calculateEndDate,
} from '../utils/vesting';

export interface DeploySchedule {
    /** YYYY-MM-DD */
    cliffEndDate: string;
    /** HH:MM (UTC). May be empty/undefined → defaults to "00:00". */
    cliffTime?: string;
    distributionDuration: number;
    durationUnit: DurationUnit;
}

/**
 * Compute the (cliff, vesting, period) seconds from a wizard schedule,
 * applying the "past-date / immediate unlock" override.
 *
 * Rationale: if the chosen cliff + duration has already finished by the
 * time the user gets to deploy (e.g. they sat on the wizard for a week),
 * the contract uses `block.timestamp` as start time, so a literal cliff
 * of -86400s would wrap negative. We overwrite to (0, 1, 1), making the
 * contract immediately unlock. Pure function; testable with `now` injected.
 */
export function planScheduleSeconds(
    schedule: DeploySchedule,
    now: Date = new Date(),
): {
    cliffSeconds: bigint;
    vestingSeconds: bigint;
    periodSeconds: bigint;
    immediateUnlock: boolean;
} {
    let cliffSeconds = cliffDateToSeconds(schedule.cliffEndDate, schedule.cliffTime || '00:00');
    let vestingSeconds = durationToSeconds(schedule.distributionDuration, schedule.durationUnit);
    let periodSeconds = unitToPeriodSeconds(schedule.durationUnit);
    let immediateUnlock = false;

    if (schedule.cliffEndDate) {
        const cliffDateTime = `${schedule.cliffEndDate}T${schedule.cliffTime || '00:00'}:00Z`;
        const cliffDate = new Date(cliffDateTime);
        const endDate = calculateEndDate(
            cliffDate,
            schedule.distributionDuration,
            schedule.durationUnit,
        );
        if (endDate && endDate.getTime() <= now.getTime()) {
            cliffSeconds = 0n;
            vestingSeconds = 1n;
            periodSeconds = 1n;
            immediateUnlock = true;
        }
    }

    return { cliffSeconds, vestingSeconds, periodSeconds, immediateUnlock };
}

/**
 * Inputs the component supplies to the planner. Everything here is already
 * sanity-checked by the time we get called (factoryAddress is valid,
 * walletAddress is connected, merkle inputs are validated).
 */
export interface DeployPlanInputs {
    factoryAddress: StellarContractId;
    tokenAddress: StellarContractId;
    owner: StellarAddress;
    name: string;
    description: string;
    schedule: DeploySchedule;
    /** Total amount in the token's base unit, parsed from user input + token decimals. */
    totalAmount: bigint;
    /** Pre-validated factory inputs from `buildFactoryDeployInputs`. */
    merkleRoot: HexString;
    recipientCount: number;
    /** Sum of amounts; used for the integrity check. */
    allocationsTotal: bigint;
    /** IPFS CID of the off-chain claim list. */
    metadataCid: string;
}

/** Subset of `FactoryDeployConfig` we construct here. Caller can spread or assign as-needed. */
export interface PlannedDeployConfig {
    factoryAddress: StellarContractId;
    tokenAddress: StellarContractId;
    merkleRoot: HexString;
    recipientCount: number;
    cliffSeconds: bigint;
    vestingSeconds: bigint;
    periodSeconds: bigint;
    totalAmount: bigint;
    owner: StellarAddress;
    name: string;
    description: string;
    metadataCid: string;
    immediateUnlock: boolean;
}

export interface PlannedScheduleSeconds {
    cliffSeconds: bigint;
    vestingSeconds: bigint;
    periodSeconds: bigint;
}

/**
 * Build the FactoryDeployConfig from validated inputs, applying the
 * past-date override and running the integrity check (allocations sum
 * must equal totalAmount). Throws if the integrity check fails.
 */
export function planDeploy(inputs: DeployPlanInputs, now: Date = new Date()): PlannedDeployConfig {
    if (inputs.allocationsTotal !== inputs.totalAmount) {
        throw new Error(
            'Integrity error: allocations sum does not match distribution total. Please recreate the distribution.',
        );
    }

    const { cliffSeconds, vestingSeconds, periodSeconds, immediateUnlock } = planScheduleSeconds(
        inputs.schedule,
        now,
    );

    return {
        factoryAddress: inputs.factoryAddress,
        tokenAddress: inputs.tokenAddress,
        merkleRoot: inputs.merkleRoot,
        recipientCount: inputs.recipientCount,
        cliffSeconds,
        vestingSeconds,
        periodSeconds,
        totalAmount: inputs.totalAmount,
        owner: inputs.owner,
        name: inputs.name,
        description: inputs.description,
        metadataCid: inputs.metadataCid,
        immediateUnlock,
    };
}

/**
 * Build the OnChainVestingContract entry used for the optimistic
 * discovery-cache update after a successful deploy. Matches the real
 * on-chain shape closely enough that the dashboard renders the new
 * distribution before the next RPC fetch.
 */
export function buildOptimisticContract(args: {
    address: StellarContractId;
    name: string;
    description: string;
    tokenAddress: StellarContractId;
    tokenSymbol?: string | null;
    tokenDecimals?: number | null;
    owner: StellarAddress;
    schedule: DeploySchedule;
    totalAmount: bigint;
    plannedSchedule?: PlannedScheduleSeconds;
    now?: Date;
}) {
    const now = args.now ?? new Date();
    return {
        address: args.address,
        name: args.name,
        description: args.description,
        token: args.tokenAddress,
        tokenSymbol: args.tokenSymbol || 'TOKEN',
        tokenDecimals: args.tokenDecimals ?? 7,
        owner: args.owner,
        vestingStart: BigInt(Math.floor(now.getTime() / 1000)),
        cliffDuration:
            args.plannedSchedule?.cliffSeconds ??
            cliffDateToSeconds(args.schedule.cliffEndDate, args.schedule.cliffTime || '00:00'),
        vestingDuration:
            args.plannedSchedule?.vestingSeconds ??
            durationToSeconds(args.schedule.distributionDuration, args.schedule.durationUnit),
        vestingPeriod:
            args.plannedSchedule?.periodSeconds ?? unitToPeriodSeconds(args.schedule.durationUnit),
        tokenBalance: args.totalAmount,
        metadataCid: null,
    };
}
