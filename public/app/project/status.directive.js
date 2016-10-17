angular.module('app').directive('pdStatus', function() {
    return {
        restrict: 'E',
        scope: {
          status: '='
        },
        template: '<div class="status {{class}}"><i class="fa {{icon}}"></i> {{status|capitalize}}</div>',
        controller: function($scope) {
            $scope.$watch('status', function() {
                switch ($scope.status) {
                    case 'succeeded':
                        $scope.icon = 'fa-check';
                        $scope.class = 'text-success';
                        break;
                    case 'running':
                        $scope.icon = 'fa-refresh fa-spin';
                        $scope.class = 'text-primary';
                        break;
                    case 'failed':
                        $scope.icon = 'fa-close';
                        $scope.class = 'text-danger';
                        break;
                    default:
                        $scope.icon = 'fa-info-circle';
                        break;
                }
            });
        }
    };
});