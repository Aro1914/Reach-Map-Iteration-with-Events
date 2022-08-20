import { loadStdlib, ask } from "@reach-sh/stdlib";
import * as backend from "./build/index.main.mjs";
const stdlib = loadStdlib();

const isAlice = await ask.ask(
    'Are you the Deployer?',
    ask.yesno
);

const who = isAlice ? 'Deployer' : await ask.ask(
    'Enter your alias:',
    (x => x)
);

console.log(`Starting the Raffle as ${who}`);

let acc = null;
const createAcc = await ask.ask(
    `Would you like to create an account? (Only available on DevNet)`,
    ask.yesno
);

if (createAcc) {
    acc = await stdlib.newTestAccount(stdlib.parseCurrency(1000));
} else {
    const secret = await ask.ask(
        `What is your account secret?`,
        (x => x)
    );
    acc = await stdlib.newAccountFromSecret(secret);
}

let ctc = null;

if (isAlice) {
    ctc = acc.contract(backend);
    ctc.getInfo().then(info => {
        console.log(`The contract is deployed as: ${JSON.stringify(info)}`);
    });
} else {
    const info = await ask.ask(
        'Please paste the contract information:',
        JSON.parse
    );
    ctc = acc.contract(backend, info);
}

const events = ctc.events;

const fmt = x => stdlib.formatCurrency(x, 4);
const getBalance = async () => fmt(await stdlib.balanceOf(acc));

const before = await getBalance();
console.log(`Your current balance is ${before}`);

const interact = { ...stdlib.hasRandom };

let done = false;

const announce = async ({ when, what }) => {
    const paddedState = what[0];
    const ifState = x => x.padEnd(15, "\u0000");

    switch (paddedState) {
        case ifState('initiating'):
            console.log(`Initiating contract operations!`);
            break;
        case ifState('opened'):
            console.log(`The contribution window has opened!`);
            break;
        case ifState('ended'):
            console.log(`The contribution window has ended!`);
            break;
        case ifState('timeout'):
            console.log(`The contribution window has timed out, proceeding to evaluation!`);
            break;
        case ifState('closed'):
            console.log(`The contribution window is closed, proceeding to evaluation!`);
            break;
        case ifState('satisfied'):
            console.log(`The conditions are satisfied, transferring funds to the Deployer!`);
            break;
        case ifState('notSatisfied'):
            console.log(`The conditions were not satisfied, initiating refund!`);
            break;
        case ifState('complete'):
            console.log(`The operations are complete!`);
            break;
        case ifState('closing'):
            console.log(`The contract is closing!`);
            const after = await getBalance();
            console.log(`${who}, your balance is now ${after}`);
            done = true;
            ask.done();
            process.exit(0);
            break;
        default:
            console.log(`An unhandled log...`);
            break;
    }
};

events.log.monitor(announce);

if (isAlice) {
    interact.deadline = { ETH: 100, ALGO: 1000, CFX: 10000 }[stdlib.connector];
    await ctc.p.Deployer(interact);
} else {
    try {
        await ctc.apis.Voters.contribute(await ask.ask(
            `How much do you want to contribute?`,
            stdlib.parseCurrency
        ));
    } catch (error) {
        console.log(`Sorry ${who}, your contribution could not be processed.`);
    }
}

while (!done) {
    await stdlib.wait(1);
}

process.exit(0);