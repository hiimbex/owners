const ownersFile = require('owners-file');
const Changes = require('./changes');

module.exports = class WatcherNotifier {
  constructor(github, event) {
    this.github = github;
    this.event = event;
  }

  get repo() {
    return {
      owner: this.event.payload.repository.owner.login,
      repo: this.event.payload.repository.name
    };
  }

  async check() {
    const changes = await this.getChanges();

    return this.comment(await this.getOwnersToPing(changes.owners));
  }

  async getChanges() {
    const owners = await this.getOwners();
    const paths = [this.event.payload.label.name];
    console.log(new Changes(paths, owners));

    return new Changes(paths, owners);
  }

  async getComments() {
    const options = Object.assign({
      number: this.event.payload.number
    }, this.repo);

    return this.github.issues.getComments(options);
  }

  async getOwners() {
    const options = Object.assign({path: 'WATCHERS'}, this.repo);
    const data = await this.github.repos.getContent(options);

    return ownersFile(Buffer.from(data.data.content, 'base64').toString());
  }

  async getOwnersToPing(owners) {
    const alreadyPinged = await this.getAlreadyPingedOwners();

    return owners.filter(owner => !alreadyPinged.includes(owner));
  }

  async getAlreadyPingedOwners() {
    const comments = await this.getComments();
    const allPings = comments.data.filter(comment => comment.user && comment.user.type && comment.user.type === 'Bot')
                             .filter(comment => comment.body && comment.body.match(/^\/cc/))
                             .reduce((pings, comment) => {
                               return pings.concat(comment.body.split(' ').slice(1));
                             }, []);

    return Array.from(new Set(allPings));
  }

  async comment(ownersToPing) {
    if (ownersToPing.length > 0) {
      return this.github.issues.createComment(Object.assign({
        number: this.event.payload.number,
        body: '/cc ' + ownersToPing.join(' ')
      }, this.repo));
    }
  }
};
