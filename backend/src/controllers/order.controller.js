const orderService = require('../services/order.service');
const workflow = require('../services/orderWorkflow.service');
const { asyncHandler, ok, created } = require('../utils/helpers');

const list = asyncHandler(async (req, res) => {
  const { data, pagination } = await orderService.listOrders(req.query, req.user);
  return ok(res, data, undefined, 200, { pagination });
});

const getOne = asyncHandler(async (req, res) => ok(res, await orderService.getOrder(req.params.id, req.user)));

const create = asyncHandler(async (req, res) =>
  created(res, await orderService.createOrder(req.body, req.user), 'Order created')
);

const update = asyncHandler(async (req, res) =>
  ok(res, await orderService.updateOrder(req.params.id, req.body, req.user), 'Order updated')
);

const remove = asyncHandler(async (req, res) => {
  await orderService.deleteOrder(req.params.id, req.user);
  return ok(res, { _id: req.params.id }, 'Order deleted');
});

const action = (fn, message, withBody = false) =>
  asyncHandler(async (req, res) => {
    const order = withBody ? await fn(req.params.id, req.body, req.user) : await fn(req.params.id, req.user);
    return ok(res, order, message);
  });

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  confirm: action(workflow.confirmOrder, 'Order confirmed'),
  process: action(workflow.processOrder, 'Order moved to processing'),
  ship: action(workflow.shipOrder, 'Order shipped'),
  deliver: action(workflow.deliverOrder, 'Order delivered'),
  receive: action(workflow.receiveOrder, 'Stock received', true),
  completeTransfer: action(workflow.completeTransfer, 'Transfer completed'),
  cancel: action(workflow.cancelOrder, 'Order cancelled', true),
};
