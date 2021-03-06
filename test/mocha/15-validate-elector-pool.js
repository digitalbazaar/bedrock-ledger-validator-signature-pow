/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const {config: {constants}, util: {uuid, BedrockError}} = bedrock;
const helpers = require('./helpers');
const {httpsAgent} = require('bedrock-https-agent');
const didv1 = new (require('did-veres-one')).VeresOne({httpsAgent});
const voValidator = require('veres-one-validator');
const jsonpatch = require('fast-json-patch');

const continuityServiceType = 'Continuity2017Peer';

const ldDocuments = new Map();
const ledgerNode = helpers.createMockLedgerNode({ldDocuments});
const mockData = require('./mock.data');

let maintainerDidDocumentFull;
let electorDidDocumentFull;
let electorServiceId;
describe('validate API ElectorPool', () => {
  describe('operationValidator', () => {
    beforeEach(async () => {
      maintainerDidDocumentFull = await didv1.generate();
      const {doc: maintainerDidDocument} = maintainerDidDocumentFull;
      ldDocuments.set(maintainerDidDocument.id, maintainerDidDocument);
      electorDidDocumentFull = await didv1.generate();
      const {doc: electorDidDocument} = electorDidDocumentFull;
      electorServiceId = `${electorDidDocument.id}#MyServiceName`;
      electorDidDocument.service = [{
        id: electorServiceId,
        type: continuityServiceType,
        serviceEndpoint: mockData.electorEndpoint[0],
      }];
      ldDocuments.set(electorDidDocument.id, electorDidDocument);
    });
    describe('create electorPool operation', () => {
      it('validates op with proper proof', async () => {
        const electorPoolDoc = _generateElectorPoolDoc();
        let operation = await _wrap(
          {didDocument: electorPoolDoc, operationType: 'create'});
        const key = _getMaintainerKeys();

        // FIXME: add an AuthorizeRequest proof that will pass json-schema
        // validation for testnet v2 *not* a valid signature
        operation.proof = bedrock.util.clone(mockData.proof);

        operation = await didv1.attachInvocationProof({
          operation,
          // capability: maintainerDid,
          capability: electorPoolDoc.id,
          capabilityAction: 'create',
          key,
        });

        // FIXME: attach proof instead of mock proof above
        // operation = await didv1.attachInvocationProof({
        //   operation,
        //   capability: maintainerDid,
        //   capabilityAction: 'AuthorizeRequest',
        //   key,
        // });
        const ledgerConfig = bedrock.util.clone(
          mockData.ledgerConfigurations.alpha);
        ledgerConfig.electorSelectionMethod = {
          type: 'VeresOne',
          // corresponds to electorPoolDocument.alpha
          electorPool: electorPoolDoc.id,
        };
        let err;
        let result;
        try {
          result = await voValidator.validate({
            basisBlockHeight: 0,
            ledgerConfig,
            ledgerNode,
            validatorInput: operation,
            validatorConfig: mockData.ledgerConfigurations.alpha
              .operationValidator[0]
          });
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        should.exist(result);
        result.should.be.an('object');
        should.exist(result.valid);
        result.valid.should.be.true;
      });
      it('fails on op with serviceId mismatch', async () => {
        const {id: maintainerDid} = maintainerDidDocumentFull.doc;
        const electorPoolDoc = _generateElectorPoolDoc();

        const incorrectServiceId = `${maintainerDid};service=Unknown`;
        electorPoolDoc.electorPool[0].service = incorrectServiceId;

        let operation = await _wrap(
          {didDocument: electorPoolDoc, operationType: 'create'});
        const key = _getMaintainerKeys();

        // FIXME: add an AuthorizeRequest proof that will pass json-schema
        // validation for testnet v2 *not* a valid signature
        operation.proof = bedrock.util.clone(mockData.proof);

        operation = await didv1.attachInvocationProof({
          operation,
          capability: electorPoolDoc.id,
          capabilityAction: 'create',
          key,
        });

        // FIXME: attach proof instead of mock proof above
        // operation = await didv1.attachInvocationProof({
        //   operation,
        //   capability: maintainerDid,
        //   capabilityAction: 'AuthorizeRequest',
        //   key,
        // });
        const ledgerConfig = bedrock.util.clone(
          mockData.ledgerConfigurations.alpha);
        ledgerConfig.electorSelectionMethod = {
          type: 'VeresOne',
          // corresponds to electorPoolDocument.alpha
          electorPool: electorPoolDoc.id,
        };
        let err;
        let result;
        try {
          result = await voValidator.validate({
            basisBlockHeight: 0,
            ledgerConfig,
            ledgerNode,
            validatorInput: operation,
            validatorConfig: mockData.ledgerConfigurations.alpha
              .operationValidator[0]
          });
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        result.valid.should.be.false;
        result.error.name.should.equal('NotFoundError');
      });
      it('fails on op w/missing create capability', async () => {
        const {id: maintainerDid} = maintainerDidDocumentFull.doc;
        const electorPoolDoc = _generateElectorPoolDoc();
        let operation = await _wrap(
          {didDocument: electorPoolDoc, operationType: 'create'});
        const key = _getMaintainerKeys();

        // no create proof added

        operation = await didv1.attachInvocationProof({
          operation,
          capability: maintainerDid,
          capabilityAction: 'AuthorizeRequest',
          key,
        });
        const ledgerConfig = bedrock.util.clone(
          mockData.ledgerConfigurations.alpha);
        ledgerConfig.electorSelectionMethod = {
          type: 'VeresOne',
          // corresponds to electorPoolDocument.alpha
          electorPool: electorPoolDoc.id,
        };
        let err;
        let result;
        try {
          result = await voValidator.validate({
            basisBlockHeight: 0,
            ledgerConfig,
            ledgerNode,
            validatorInput: operation,
            validatorConfig: mockData.ledgerConfigurations.alpha
              .operationValidator[0]
          });
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        result.valid.should.be.false;
        // schema validation detects the missing proof
        result.error.name.should.equal('ValidationError');
      });

      it('fails on op w/missing AuthorizeRequest capability', async () => {
        const {id: maintainerDid} = maintainerDidDocumentFull.doc;
        const electorPoolDoc = _generateElectorPoolDoc();
        let operation = await _wrap(
          {didDocument: electorPoolDoc, operationType: 'create'});
        const key = _getMaintainerKeys();

        // no AuthorizeRequest proof added

        operation = await didv1.attachInvocationProof({
          operation,
          capability: maintainerDid,
          capabilityAction: 'create',
          key,
        });
        const ledgerConfig = bedrock.util.clone(
          mockData.ledgerConfigurations.alpha);
        ledgerConfig.electorSelectionMethod = {
          type: 'VeresOne',
          // corresponds to electorPoolDocument.alpha
          electorPool: electorPoolDoc.id,
        };
        let err;
        let result;
        try {
          result = await voValidator.validate({
            basisBlockHeight: 0,
            ledgerConfig,
            ledgerNode,
            validatorInput: operation,
            validatorConfig: mockData.ledgerConfigurations.alpha
              .operationValidator[0]
          });
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        result.valid.should.be.false;
        result.error.name.should.equal('ValidationError');
      });
      it('fails on op w/two create capability proofs', async () => {
        const electorPoolDoc = _generateElectorPoolDoc();
        let operation = await _wrap(
          {didDocument: electorPoolDoc, operationType: 'create'});
        const key = _getMaintainerKeys();

        // no AuthorizeRequest proof added

        operation = await didv1.attachInvocationProof({
          operation,
          capability: electorPoolDoc.id,
          capabilityAction: 'create',
          key,
        });
        operation = await didv1.attachInvocationProof({
          operation,
          capability: electorPoolDoc.id,
          capabilityAction: 'create',
          key,
        });
        const ledgerConfig = bedrock.util.clone(
          mockData.ledgerConfigurations.alpha);
        ledgerConfig.electorSelectionMethod = {
          type: 'VeresOne',
          // corresponds to electorPoolDocument.alpha
          electorPool: electorPoolDoc.id,
        };
        let err;
        let result;
        try {
          result = await voValidator.validate({
            basisBlockHeight: 0,
            ledgerConfig,
            ledgerNode,
            validatorInput: operation,
            validatorConfig: mockData.ledgerConfigurations.alpha
              .operationValidator[0]
          });
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        result.valid.should.be.false;
        result.error.name.should.equal('ValidationError');
      });
      it('fails on op w/two AuthorizeRequest capability proofs', async () => {
        const {id: maintainerDid} = maintainerDidDocumentFull.doc;
        const electorPoolDoc = _generateElectorPoolDoc();
        let operation = await _wrap(
          {didDocument: electorPoolDoc, operationType: 'create'});
        const key = _getMaintainerKeys();

        // no create proof added

        operation = await didv1.attachInvocationProof({
          algorithm: 'Ed25519Signature2018',
          operation,
          capability: maintainerDid,
          capabilityAction: 'AuthorizeRequest',
          key,
        });
        operation = await didv1.attachInvocationProof({
          algorithm: 'Ed25519Signature2018',
          operation,
          capability: maintainerDid,
          capabilityAction: 'AuthorizeRequest',
          key,
        });
        const ledgerConfig = bedrock.util.clone(
          mockData.ledgerConfigurations.alpha);
        ledgerConfig.electorSelectionMethod = {
          type: 'VeresOne',
          // corresponds to electorPoolDocument.alpha
          electorPool: electorPoolDoc.id,
        };
        let err;
        let result;
        try {
          result = await voValidator.validate({
            basisBlockHeight: 0,
            ledgerConfig,
            ledgerNode,
            validatorInput: operation,
            validatorConfig: mockData.ledgerConfigurations.alpha
              .operationValidator[0]
          });
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        result.valid.should.be.false;
        result.error.name.should.equal('ValidationError');
      });
      it('fails on op w/incorrect capability DID', async () => {
        const electorPoolDoc = _generateElectorPoolDoc();
        let operation = await _wrap(
          {didDocument: electorPoolDoc, operationType: 'create'});
        const key = _getMaintainerKeys();

        // FIXME: add an AuthorizeRequest proof that will pass json-schema
        // validation for testnet v2 *not* a valid signature
        operation.proof = bedrock.util.clone(mockData.proof);

        // replacing electorDid with maintainerDid
        operation = await didv1.attachInvocationProof({
          operation,
          // this DID document does not exist
          capability: 'did:v1:uuid:e798d4cf-f4f5-40cb-9f06-7fa56cf55d95',
          capabilityAction: 'create',
          key,
        });

        // FIXME: attach proof instead of mock proof above
        // operation = await didv1.attachInvocationProof({
        //   operation,
        //   capability: maintainerDid,
        //   capabilityAction: 'AuthorizeRequest',
        //   key,
        // });
        const ledgerConfig = bedrock.util.clone(
          mockData.ledgerConfigurations.alpha);
        ledgerConfig.electorSelectionMethod = {
          type: 'VeresOne',
          // corresponds to electorPoolDocument.alpha
          electorPool: electorPoolDoc.id,
        };
        let err;
        let result;
        try {
          result = await voValidator.validate({
            basisBlockHeight: 0,
            ledgerConfig,
            ledgerNode,
            validatorInput: operation,
            validatorConfig: mockData.ledgerConfigurations.alpha
              .operationValidator[0]
          });
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        result.valid.should.be.false;
        result.error.details.proofVerifyResult.verified.should.be.false;
        // the fictitious DID specified in the capability does not match the
        // this new document and is also not found on the ledger resulting in
        // a NotFoundError from the document loader.
        result.error.details.proofVerifyResult.results[0].error.name
          .should.equal('NotFoundError');
        result.error.name.should.equal('ValidationError');
      });
    }); // end create electorPool operation

    describe('update electorPool operation', () => {
      it('validates an operation with proper proof', async () => {
        const {id: electorDid} = electorDidDocumentFull.doc;
        const {id: maintainerDid} = maintainerDidDocumentFull.doc;
        const electorPoolDoc = bedrock.util.clone(
          mockData.electorPoolDocument.alpha);
        electorPoolDoc.electorPool[0].elector = electorDid;
        electorPoolDoc.electorPool[0].service = electorServiceId;
        electorPoolDoc.electorPool[0].capability[0].id = maintainerDid;
        // the invocationTarget is the ledger ID
        electorPoolDoc.electorPool[0].capability[0].invocationTarget =
          'urn:uuid:e9e63a07-15b1-4e8f-b725-a71a362cfd99';
        electorPoolDoc.controller = maintainerDid;
        ldDocuments.set(electorPoolDoc.id, bedrock.util.clone(electorPoolDoc));
        const observer = jsonpatch.observe(electorPoolDoc);
        const elector =
          'did:v1:nym:z279squ73dJ3q21jAEk3FRrr37UdX5xo8FXWA74anmPnvzfx';

        // FIXME: should inline serviceIds be did: URI's?
        const newServiceId = `${elector};service=TheServiceId`;

        const newServiceEndpoint = mockData.electorEndpoint[1];
        const {capability} = electorPoolDoc.electorPool[0];
        // using an inline service descriptor
        electorPoolDoc.electorPool.push({
          // elector DID is not dereferenced in this case
          elector,
          capability,
          id: _generateUrnUuid(),
          type: ['Continuity2017GuarantorElector', 'Continuity2017Elector'],
          service: {
            id: newServiceId,
            serviceEndpoint: newServiceEndpoint,
            type: continuityServiceType,
          },
        });
        const patch = jsonpatch.generate(observer);

        let operation = {
          '@context': constants.WEB_LEDGER_CONTEXT_V1_URL,
          creator: 'https://example.com/some/ledger/node',
          recordPatch: {
            '@context': mockData.patchContext,
            patch,
            sequence: 0,
            target: electorPoolDoc.id,
          },
          type: 'UpdateWebLedgerRecord',
        };

        const key = _getMaintainerKeys();

        // FIXME: what are proper proofs for an update operation?

        // FIXME: add an AuthorizeRequest proof that will pass json-schema
        // validation for testnet v2 *not* a valid signature
        operation.proof = bedrock.util.clone(mockData.proof);

        operation = await didv1.attachInvocationProof({
          operation,
          capability: electorPoolDoc.id,
          // capabilityAction: operation.type,
          capabilityAction: 'update',
          key,
        });
        // FIXME: replace mock proof above with legitimate proof
        // operation = await didv1.attachInvocationProof({
        //   operation,
        //   capability: maintainerDid,
        //   // capabilityAction: operation.type,
        //   capabilityAction: 'AuthorizeRequest',
        //   key,
        // });
        const ledgerConfig = bedrock.util.clone(
          mockData.ledgerConfigurations.alpha);
        ledgerConfig.electorSelectionMethod = {
          type: 'VeresOne',
          // corresponds to electorPoolDocument.alpha
          electorPool: electorPoolDoc.id,
        };
        let err;
        let result;
        try {
          result = await voValidator.validate({
            basisBlockHeight: 0,
            ledgerConfig,
            ledgerNode,
            validatorInput: operation,
            validatorConfig: mockData.ledgerConfigurations.alpha
              .operationValidator[0]
          });
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        assertNoError(result.error);
        result.valid.should.be.true;
      });
      it('rejects an operation removing electorPool', async () => {
        const {id: electorDid} = electorDidDocumentFull.doc;
        const {id: maintainerDid} = maintainerDidDocumentFull.doc;
        const electorPoolDoc = bedrock.util.clone(
          mockData.electorPoolDocument.alpha);
        electorPoolDoc.electorPool[0].elector = electorDid;
        electorPoolDoc.electorPool[0].service = electorServiceId;
        electorPoolDoc.electorPool[0].capability[0].id = maintainerDid;
        // the invocationTarget is the ledger ID
        electorPoolDoc.electorPool[0].capability[0].invocationTarget =
          'urn:uuid:e9e63a07-15b1-4e8f-b725-a71a362cfd99';
        electorPoolDoc.controller = maintainerDid;
        ldDocuments.set(electorPoolDoc.id, bedrock.util.clone(electorPoolDoc));
        const observer = jsonpatch.observe(electorPoolDoc);

        delete electorPoolDoc.electorPool;

        const patch = jsonpatch.generate(observer);

        let operation = {
          '@context': constants.WEB_LEDGER_CONTEXT_V1_URL,
          creator: 'https://example.com/some/ledger/node',
          recordPatch: {
            '@context': mockData.patchContext,
            patch,
            sequence: 0,
            target: electorPoolDoc.id,
          },
          type: 'UpdateWebLedgerRecord',
        };

        const key = _getMaintainerKeys();

        // FIXME: what are proper proofs for an update operation?

        // FIXME: add an AuthorizeRequest proof that will pass json-schema
        // validation for testnet v2 *not* a valid signature
        operation.proof = bedrock.util.clone(mockData.proof);

        operation = await didv1.attachInvocationProof({
          operation,
          capability: electorPoolDoc.id,
          // capabilityAction: operation.type,
          capabilityAction: 'update',
          key,
        });
        // FIXME: replace mock proof above with legitimate proof
        // operation = await didv1.attachInvocationProof({
        //   operation,
        //   capability: maintainerDid,
        //   // capabilityAction: operation.type,
        //   capabilityAction: 'AuthorizeRequest',
        //   key,
        // });
        const ledgerConfig = bedrock.util.clone(
          mockData.ledgerConfigurations.alpha);
        ledgerConfig.electorSelectionMethod = {
          type: 'VeresOne',
          // corresponds to electorPoolDocument.alpha
          electorPool: electorPoolDoc.id,
        };
        let err;
        let result;
        try {
          result = await voValidator.validate({
            basisBlockHeight: 0,
            ledgerConfig,
            ledgerNode,
            validatorInput: operation,
            validatorConfig: mockData.ledgerConfigurations.alpha
              .operationValidator[0]
          });
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        result.valid.should.be.false;
        should.exist(result.error);
        result.error.name.should.equal('ValidationError');
        result.error.message.should.contain('ElectorPool Document');
      });
    }); // end update electorPool operation
  });
});

function _generateElectorPoolDoc() {
  const {id: electorDid} = electorDidDocumentFull.doc;
  const {id: maintainerDid} = maintainerDidDocumentFull.doc;
  const electorPoolDoc = bedrock.util.clone(
    mockData.electorPoolDocument.alpha);
  electorPoolDoc.electorPool[0].elector = electorDid;
  electorPoolDoc.electorPool[0].service = electorServiceId;
  electorPoolDoc.electorPool[0].capability[0].id = maintainerDid;
  // the invocationTarget is the ledger ID
  electorPoolDoc.electorPool[0].capability[0].invocationTarget =
    'urn:uuid:e9e63a07-15b1-4e8f-b725-a71a362cfd99';
  electorPoolDoc.controller = maintainerDid;
  return electorPoolDoc;
}

function _generateUrnUuid() {
  return `urn:uuid:${uuid()}`;
}

function _getMaintainerKeys() {
  const invokePublicKey = maintainerDidDocumentFull.doc
    .capabilityInvocation[0];
  return maintainerDidDocumentFull.keys[invokePublicKey.id];
}

// this is a modified version of the wrap API found in did-veres-one and
// web-ledger-client
async function _wrap({didDocument, operationType = 'create'}) {
  const operation = {'@context': constants.WEB_LEDGER_CONTEXT_V1_URL};

  // normally this is set basted on the targetNode value provided by the
  // ledger-agent HTTP API
  operation.creator = 'https://example.com/some/ledger/node';

  switch(operationType) {
    case 'create':
      operation.type = 'CreateWebLedgerRecord';
      operation.record = didDocument;
      break;
    case 'update':
      operation.type = 'UpdateWebLedgerRecord';
      operation.recordPatch = didDocument;
      break;
    default:
      throw new BedrockError(
        'Unknown operation type.', 'SyntaxError', {operationType});
  }

  return operation;
}
