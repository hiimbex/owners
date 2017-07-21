const OwnerNotifier = require('./lib/owner-notifier');
const WatcherNotifier = require('./lib/watcher-notifier');


module.exports = robot => {
  const notifyOwners = async function (event) {
    const github = await robot.auth(event.payload.installation.id);
    const notifier = new OwnerNotifier(github, event);

    return notifier.check();
  };

  const notifyWatchers = async function (event) {
    const github = await robot.auth(event.payload.installation.id);
    const notifier = new WatcherNotifier(github, event);

    return notifier.check();
  };

  robot.on('pull_request.opened', notifyOwners);
  robot.on('pull_request.synchronize', notifyOwners);
  robot.on('pull_request.labeled', notifyWatchers);
};
