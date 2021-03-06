const expect = require('expect');

const Changes = require('../lib/changes');
const OwnerNotifier = require('../lib/owner-notifier');

function createComment(userType, body) {
  return {
    body,
    user: {
      type: userType
    }
  };
}

describe('OwnerNotifier', () => {
  const BASE_SHA = '1234567890abcdef1234567890abcdef12345678';
  const HEAD_SHA = '234567890abcdef1234567890abcdef123456789';
  const ISSUE_NUMBER = 42;

  let event;
  let github;
  let notifier;

  beforeEach(() => {
    event = {
      payload: {
        repository: {
          name: 'bar',
          owner: {
            login: 'foo'
          }
        }
      }
    };
  });

  describe('repo property', () => {
    beforeEach(() => {
      github = expect.createSpy();
      notifier = new OwnerNotifier(github, event);
    });

    it('extracts the right information', () => {
      expect(notifier.repo).toMatch({owner: 'foo', repo: 'bar'});
      expect(github).toNotHaveBeenCalled();
    });
  });

  describe('getOwners', () => {
    beforeEach(() => {
      github = {
        repos: {
          getContent: expect.createSpy().andReturn(Promise.resolve({
            content: new Buffer('@manny\n@moe\n@jack').toString('base64')
          }))
        }
      };

      notifier = new OwnerNotifier(github, event);
    });

    it('returns an ownersFile object', async () => {
      const ownersFile = await notifier.getOwners();

      expect(ownersFile).toExist();
      expect(ownersFile.for).toExist();
      expect(github.repos.getContent).toHaveBeenCalledWith({
        owner: 'foo',
        repo: 'bar',
        path: 'OWNERS'
      });
    });
  });

  describe('getChanges', () => {
    beforeEach(() => {
      event.payload.pull_request = {
        base: {
          sha: BASE_SHA
        },
        head: {
          sha: HEAD_SHA
        }
      };

      github = {
        repos: {
          compareCommits: expect.createSpy().andReturn(Promise.resolve({
            files: [
              {
                filename: 'wibble'
              },
              {
                filename: 'wobble'
              }
            ]
          })),
          getContent: expect.createSpy().andReturn(Promise.resolve({
            content: new Buffer('manny\nmoe\njack').toString('base64')
          }))
        }
      };

      notifier = new OwnerNotifier(github, event);
    });

    it('returns an appropriate Changes object', async () => {
      const changes = await notifier.getChanges();

      expect(changes).toBeA(Changes);
      expect(changes.paths).toInclude('wibble');
      expect(changes.paths).toInclude('wobble');
      expect(changes.paths.length).toEqual(2);

      expect(github.repos.compareCommits).toHaveBeenCalledWith({
        owner: 'foo',
        repo: 'bar',
        base: BASE_SHA,
        head: HEAD_SHA
      });
    });
  });

  describe('comment', () => {
    beforeEach(() => {
      event.payload.number = ISSUE_NUMBER;

      github = {
        issues: {
          createComment: expect.createSpy().andReturn(Promise.resolve())
        }
      };

      notifier = new OwnerNotifier(github, event);
    });

    it('returns successfully', async () => {
      await notifier.comment([
        '@manny',
        '@moe',
        '@jack'
      ]);

      expect(github.issues.createComment).toHaveBeenCalledWith({
        owner: 'foo',
        repo: 'bar',
        number: ISSUE_NUMBER,
        body: '/cc @manny @moe @jack'
      });
    });
  });

  describe('getAlreadyPingedOwners', () => {
    beforeEach(() => {
      event.payload.number = ISSUE_NUMBER;

      github = {
        issues: {},
        users: {
          get: expect.createSpy().andReturn(Promise.resolve({
            type: 'Bot'
          }))
        }
      };

      notifier = new OwnerNotifier(github, event);
    });

    it('recognizes a properly formed comment from a Bot user', async () => {
      github.issues.getComments = expect.createSpy().andReturn(Promise.resolve([
        createComment('Bot', '/cc @manny')
      ]));

      const pings = await notifier.getAlreadyPingedOwners();

      expect(pings.length).toEqual(1);
      expect(pings).toInclude('@manny');
    });

    it('recognizes multiple pings in a single comment from a Bot user', async () => {
      github.issues.getComments = expect.createSpy().andReturn(Promise.resolve([
        createComment('Bot', '/cc @manny @moe @jack')
      ]));

      const pings = await notifier.getAlreadyPingedOwners();

      expect(pings.length).toEqual(3);
      expect(pings).toInclude('@manny');
      expect(pings).toInclude('@moe');
      expect(pings).toInclude('@jack');
    });

    it('rejects pings from other user types', async () => {
      github.issues.getComments = expect.createSpy().andReturn(Promise.resolve([
        createComment('User', '/cc @manny @moe @jack')
      ]));

      const pings = await notifier.getAlreadyPingedOwners();

      expect(pings.length).toEqual(0);
    });

    it('rejects pings that are not formatted correctly', async () => {
      github.issues.getComments = expect.createSpy().andReturn(Promise.resolve([
        createComment('User', '@manny @moe @jack')
      ]));

      const pings = await notifier.getAlreadyPingedOwners();

      expect(pings.length).toEqual(0);
    });

    it('only includes one copy of any name', async () => {
      github.issues.getComments = expect.createSpy().andReturn(Promise.resolve([
        createComment('Bot', '/cc @manny @manny'),
        createComment('Bot', '/cc @manny')
      ]));

      const pings = await notifier.getAlreadyPingedOwners();

      expect(pings.length).toEqual(1);
    });
  });

  describe('getOwnersToPing', () => {
    beforeEach(() => {
      event.payload.number = ISSUE_NUMBER;

      github = {
        issues: {}
      };

      notifier = new OwnerNotifier(github, event);
    });

    it('returns only owners that have not been pinged', async () => {
      github.issues.getComments = expect.createSpy().andReturn(Promise.resolve([
        createComment('Bot', '/cc @manny')
      ]));

      const pings = await notifier.getOwnersToPing(['@manny', '@moe', '@jack']);

      expect(pings.length).toEqual(2);
      expect(pings).toInclude('@moe');
      expect(pings).toInclude('@jack');
    });
  });
});
