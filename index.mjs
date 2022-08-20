import { loadStdlib, ask } from "@reach-sh/stdlib";
import * as backend from "./build/index.main.mjs";
const stdlib = loadStdlib();

const isAlice = await ask.ask(
    'Are you the Deployer?',
    ask.yesno
);

const who = isAlice ? 'Deployer' : await ask.ask(
    'Enter your alias:', // This allows the user to enter an identifier of his choice
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
    acc = await stdlib.newAccountFromSecret(secret); // This allows a connection to the user's already owned wallet address
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

const announce = async ({ when, what }) => { // when is usually the consensus time, but we wont be using that in this example
    const paddedState = what[0]; // The values returned from the contract are accessible from the array represented by what, in this case only one value is being returned which a 15 character long Byte, therefore the reference to the first index
    const ifState = x => x.padEnd(15, "\u0000"); // A helpful utility function that parses a given string to 15 Bytes, very useful in switching the returned value from the backend

    switch (paddedState) { // Here the different possible return values for the event are switched and the relevant operations carried out
        case ifState('initiating'):
            console.log(`Initiating contract operations!`);
            break;
        case ifState('opened'):
            console.log(`The contribution window has opened!`);
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
        case ifState('closing'): // It is necessary to carry out the finalizing of the program only after being informed of the contract closing, so that some vital operations are not left unhandled
            console.log(`The contract is closing!`);
            const after = await getBalance();
            console.log(`${who}, your balance is now ${after}`);
            done = true;
            ask.done();
            process.exit(0); // We exit this process
            break;
        default:
            console.log(`An unhandled log...`);
            break;
    }
};

events.log.monitor(announce); // Here we pass the reference to the function that will receive the values passed by the backend to indicate the current state of the contract

if (isAlice) {
    interact.deadline = { ETH: 100, ALGO: 1000, CFX: 10000 }[stdlib.connector];
    await ctc.p.Deployer(interact);
} else {
    try {
        await ctc.apis.Voters.contribute(await ask.ask( // Here the user given the power to make a contribution to the contract while the contribution window is still open
            `How much do you want to contribute?`,
            stdlib.parseCurrency
        ));
    } catch (error) {
        console.log(`Sorry ${who}, your contribution could not be processed.`);
    }
}

while (!done) { // This is necessary so that our the flow of our application moves linearly with the passing of time and not dependent on interactions with the contract
    await stdlib.wait(1); // This makes the application wait through one consensus block, and at the same makes the timeout counter in the backend observe an update to the consensus time
}

process.exit(0); // We exit the application successfully with no errors