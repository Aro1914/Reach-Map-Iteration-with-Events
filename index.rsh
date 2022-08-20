/* eslint-disable eqeqeq */
/* eslint-disable no-undef */
"reach 0.1";

const state = Bytes(15);

export const main = Reach.App(() => {
    setOptions({ untrustworthyMaps: true });

    const Deployer = Participant("Deployer", {
        ...hasRandom,
        deadline: UInt,
    });

    const Voters = API("Voters", {
        contribute: Fun([UInt], Null),
    });

    const Logger = Events({
        log: [state], // Creation of the contract state logger
    });

    init();
    Deployer.publish();
    Logger.log(state.pad("initiating")); // Informs all connected that operations are about to commence
    // There is a need to pad the returned Bytes because of nature of Reach being statically typed, all values must have a definite predefined structure, thus as defined on line 5 and 20, we must be sending back a 15 character long Byte back to the frontend.
    
    commit();
    Deployer.only(() => {
        const deadline = declassify(interact.deadline);
    });
    Deployer.publish(deadline);
    const contributors = new Map( // Please note that UInt key types are not supported by the Algorand Network
        UInt, Object({
            address: Address,
            amt: UInt,
        })
    );
    commit();
    Deployer.publish();

    const [timeRemaining, keepOnGoing] = makeDeadline(deadline); // A very convenient way of making a deadline based on the published value
    // This returns two callable values that denote the deadline window

    const isValid = false; // Switch this value to either refund or cash out all paid funds; true catches out, false refunds

    Logger.log(state.pad("opened")); // Informs all connected that the contribution window has opened
    const [count, currentBal, lastAddress] = parallelReduce([1, balance(), Deployer])
        .invariant(balance() == currentBal) // Edit this to suit the flow of your DApp
        .while(keepOnGoing()) // This ensures the loop continues while the deadline has not been reached
        .api_(Voters.contribute, (amt) => {
            check(amt > 0, "Contribution too small");
            const payment = amt; // This is amount to be paid to the contract
            return [payment, (notify) => { // In the first index of the return, the payment is transferred to the contract (This could be non-network tokens too)
                notify(null);
                contributors[count] = { address: this, amt: amt };
                // (count + 1) <= 4 ? keepGoing : false
                return [count + 1, currentBal + payment, this]; // Review carefully how you would want to update the while condition, in this case the condition states that the loop continues till 20 blocks after the last consensus time and as long as keepGoing is true
            }];
        })
        .timeout(
            timeRemaining(), // This ensures that the timeout is called only after the alloted deadline
            () => { //
                Deployer.publish();
                Logger.log(state.pad("timeout")); // Informs all connected that a timeout has taken place
                // Additional functionality could be added to this block, but keep in mind that it will only be executed in a timeout; in this case if keepGoing is updated to false before the timeout, this block would not run
                return [count, currentBal, lastAddress];
            }
        );
    if (isValid) { // A condition to decide if a refund is to be carried out or the Deployer cashes out the contract's balance
        Logger.log(state.pad("satisfied")); // Informs all connected that the conditions for the Deployer cashing out the contract balance has been met
        transfer(balance()).to(Deployer); // A cash out occurs
    } else {
        Logger.log(state.pad("notSatisfied")); // Informs all connected that the conditions for the Deployer cashing out the contract balance were not fulfilled therefore a refund takes place
        // The entire logic for a refund, only compatible on the ETH network for now, until an alternative can be derived for UInt Map keys
        const fromMap = (m) => fromMaybe(m, (() => ({ address: lastAddress, amt: 0 })), ((x) => x)); // This utility function retrieves the actual value in a Map reference if there is a value
        // Note this function must be customized to the conform to structure of the values held in the Map reference, if the Map holds just a UInt in its value then the return for the None block must be a UInt; in this case the return for the None block is an object of an address of the last API caller and an amount of zero
        var [newCount, currentBalance] = [count, balance()];
        invariant(balance() == currentBalance);
        while (newCount >= 1) {
            commit();
            Deployer.publish();
            if (balance() >= fromMap(contributors[newCount]).amt) { // Guard to ensure that there is sufficient balance in the contract to carry out the transfer
                transfer(fromMap(contributors[newCount]).amt).to(
                    fromMap(contributors[newCount]).address
                ); // The refund
            }
            [newCount, currentBalance] = [newCount - 1, balance()];
            continue;
        }
    }
    transfer(balance()).to(Deployer); // In the event the contract was not emptied before this point, the balance goes to the deployer 
    Logger.log(state.pad("complete")); // Informs all connected that all necessary operations in the contract have been carried out
    Logger.log(state.pad("closing")); // Informs all connected that the contract is about closing
    commit();
    exit();
});
