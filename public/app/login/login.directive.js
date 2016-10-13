angular.module('app', [])
    .directive('login', function() {
        return {
            restrict: 'E',
            templateUrl: '/app/login/login.html',
            controller: function($scope, UserService) {
                $scope.onSubmit = function() {
                    UserService.login($scope.user.username, $scope.user.password);
                };
            }
        };
    });

